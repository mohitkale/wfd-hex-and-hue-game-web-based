import Phaser from "phaser";
import {
  GameSession,
  trackFor,
  type BuiltLevel,
  type LaunchSource,
  type SessionEvent,
  type TrackCell,
  type TrackWisp,
} from "@hexhue/core";
import { computeLayout, type Insets, type Layout } from "../layout";
import { Haptics } from "../haptics";
import { flatLevels } from "../progress";
import { getSave, starsFor } from "../save";
import { keyToSource } from "../keys";
import { levelAt, worlds } from "../levels";
import {
  LAUNCH_FLIGHT_MS,
  TICK_MS,
  accumulate,
  approach,
  flightPoint,
  trackPosition,
  type Point,
  type Speed,
} from "../motion";
import { hexToNumber, theme } from "../theme";
import { revealOrder, revealedCount } from "../reveal";
import { drawBoardChrome } from "../view/BoardChrome";
import { Button } from "../view/Button";
import { MosaicView } from "../view/MosaicView";
import { WispView } from "../view/WispView";
import { TEX, ensureTextures } from "../view/textures";

export interface PlayData {
  world: number;
  level: number;
}

/** Draw order; explicit so rebuilt layers never cover persistent wisps. */
// The HUD stays above result cards so Back always works.
const DEPTH = { chrome: 0, mosaic: 1, wisps: 2, fx: 3, overlay: 4, hud: 5 } as const;

/** Losses in a row on one level before the lose card offers a free skip. */
const SKIP_AFTER = 3;

/** Win reveal: how long the finished artwork takes to bloom back in. */
const REVEAL_MS = 1100;

/** How many wisps of each summon column are drawn (the rest show as "+n"). */
const VISIBLE_STACK = 3;

/** Where a wisp view should be: following the track, or resting at a spot. */
type Target =
  | { kind: "track"; wisp: TrackWisp }
  | { kind: "rest"; x: number; y: number; r: number; alpha: number };

/** A wisp hopping from a column or slot onto the track. */
interface Flight {
  from: Point;
  fromR: number;
  elapsed: number;
}

export class PlayScene extends Phaser.Scene {
  private data_!: PlayData;
  private built!: BuiltLevel;
  private session!: GameSession;
  private track!: readonly TrackCell[];
  private layout!: Layout;
  private mosaic: MosaicView | null = null;
  private chrome: Phaser.GameObjects.GameObject[] = [];
  private hud: Phaser.GameObjects.GameObject[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private moreLabels: Phaser.GameObjects.Text[] = [];
  private wisps = new Map<number, WispView>();
  private targets = new Map<number, Target>();
  private flights = new Map<number, Flight>();
  /** Wisps tapped but waiting for the entry; refreshed with targets, read every frame. */
  private queued = new Set<number>();
  /** Spent wisps still animating into the portal. */
  private departing = new Set<WispView>();
  private speedLabel: Phaser.GameObjects.Text | null = null;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private overlayKind: "win" | "lose" | null = null;
  /** Win reveal progress; `null` when not revealing. */
  private reveal: { order: number[]; shown: number; elapsed: number } | null = null;
  /** Won, waiting for the last wisp to reach the portal before the reveal starts. */
  private revealPending = false;
  private lastLayoutKey = "";
  private readonly haptics = new Haptics();
  private acc = 0;
  private speed: Speed = 1;
  /** Undos and boosters used this attempt; lowers the star rating, never blocks progress. */
  private assists = 0;

  constructor() {
    super("play");
  }

  init(data: PlayData): void {
    this.data_ = data;
    this.built = levelAt(data.world, data.level)!;
  }

  create(): void {
    // Phaser reuses this instance across restarts and destroys all game objects on shutdown, so
    // per-run state must start fresh here.
    this.wisps = new Map();
    this.targets = new Map();
    this.mosaic = null;
    this.chrome = [];
    this.hud = [];
    this.zones = [];
    this.moreLabels = [];
    this.flights = new Map();
    this.queued = new Set();
    this.departing = new Set();
    this.overlay = [];
    this.overlayKind = null;
    this.reveal = null;
    this.revealPending = false;
    this.speedLabel = null;
    this.lastLayoutKey = "";
    this.acc = 0;
    this.speed = 1;
    this.assists = 0;
    const save = getSave(this);
    this.haptics.enabled = save?.data.settings.haptics ?? true;
    save?.update((d) => {
      d.stats.plays++;
      d.lastPlayed = { world: this.data_.world, level: this.data_.level };
    });

    ensureTextures(this);
    this.cameras.main.setBackgroundColor(theme.night);
    const level = this.built.level;
    this.track = trackFor(level.width, level.height);
    this.session = new GameSession(level);
    const unsubscribe = this.session.subscribe((e) => this.onEvent(e));
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const source = keyToSource(e.code, level.columns.length, this.session.state.slots.length);
      if (source) this.tap(source);
    };
    this.input.keyboard?.on("keydown", onKey);
    this.scale.on("resize", this.relayout, this);
    this.events.once("shutdown", () => {
      unsubscribe();
      this.input.keyboard?.off("keydown", onKey);
      this.scale.off("resize", this.relayout, this);
      this.mosaic?.destroy();
      this.mosaic = null;
    });
    this.relayout();
  }

  override update(_time: number, delta: number): void {
    const s = this.session.state;
    if (s.status === "playing" && (s.track.length > 0 || this.session.pending.length > 0)) {
      const { steps, acc } = accumulate(this.acc, delta, this.speed);
      this.acc = acc;
      for (let i = 0; i < steps; i++) {
        // Refresh per tick that changed something, so a wisp launched in one tick has a view
        // before it collects in the next.
        if (this.session.tick().length > 0) this.refreshTargets();
      }
    } else if (s.status === "playing") {
      // Idle (nothing moving): the player can wait forever without the loop doing any work.
      this.acc = 0;
    }
    if (this.reveal) this.stepReveal(delta);
    this.mosaic?.flush();
    this.moveWisps(delta);
  }

  // ── Layout ──────────────────────────────────────────────────────────────

  private relayout(): void {
    const { width, height } = this.scale.gameSize;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const insets = (this.registry.get("insets") as Insets | undefined) ?? {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
    const level = this.built.level;
    this.layout = computeLayout({
      width,
      height,
      dpr,
      insets,
      boardWidth: level.width,
      boardHeight: level.height,
      slots: this.session.state.slots.length,
      columns: level.columns.length,
    });
    // Resize events arrive in bursts; the layout is pure, so skip identical ones.
    const key = JSON.stringify(this.layout);
    if (key === this.lastLayoutKey) return;
    this.lastLayoutKey = key;

    for (const o of [...this.chrome, ...this.hud, ...this.zones, ...this.moreLabels]) o.destroy();
    this.mosaic?.destroy();
    this.chrome = drawBoardChrome(
      this,
      this.layout,
      level.width,
      level.height,
      this.session.state.slots.length,
    );
    for (const o of this.chrome) {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH.chrome);
    }
    this.mosaic = new MosaicView(this, this.layout, level, this.session.state.cells);
    this.mosaic.image.setDepth(DEPTH.mosaic);
    if (this.reveal) this.paintArtwork(this.reveal.shown);
    else if (this.session.state.status === "won" && !this.revealPending) {
      this.paintArtwork(level.cells.length);
    }
    this.drawHud();
    this.createTapZones();
    this.moreLabels = this.layout.columns.map((zone) =>
      this.add
        .text(zone.x + zone.w / 2, zone.y + zone.h - 10 * dpr, "", {
          fontFamily: theme.font,
          fontSize: `${Math.round(12 * dpr)}px`,
          color: theme.textDim,
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.wisps)
        .setVisible(false),
    );
    this.refreshTargets(true);
    // Views keep their identity across relayouts; snap them to their new spots.
    for (const [id, view] of this.wisps) this.snap(id, view);
    if (this.overlayKind) this.showCard(this.overlayKind, false);
  }

  private drawHud(): void {
    const { hud, dpr } = this.layout;
    const world = worlds[this.data_.world]!;
    const touch = 48 * dpr;
    const font = (size: number) => `${Math.round(size * dpr)}px`;

    const backZone = this.add
      .zone(hud.x + 4 * dpr, hud.y + (hud.h - touch) / 2, touch, touch)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.scene.start("levels"));
    const back = this.add
      .text(backZone.x + touch / 2, hud.y + hud.h / 2, "‹", {
        fontFamily: theme.font,
        fontSize: font(34),
        color: theme.text,
      })
      .setOrigin(0.5, 0.55);
    const title = this.add
      .text(hud.x + hud.w / 2, hud.y + hud.h / 2 - 8 * dpr, this.built.level.name, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: font(18),
        color: theme.text,
      })
      .setOrigin(0.5);
    const subtitle = this.add
      .text(
        hud.x + hud.w / 2,
        hud.y + hud.h / 2 + 12 * dpr,
        `${world.name} · ${this.data_.level + 1}`,
        {
          fontFamily: theme.font,
          fontSize: font(12),
          color: theme.textDim,
        },
      )
      .setOrigin(0.5);

    const speedZone = this.add
      .zone(hud.x + hud.w - touch - 4 * dpr, hud.y + (hud.h - touch) / 2, touch, touch)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.toggleSpeed());
    this.speedLabel = this.add
      .text(speedZone.x + touch / 2, hud.y + hud.h / 2, "", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: font(16),
        color: theme.text,
        backgroundColor: "#2a1650",
        padding: { x: Math.round(8 * dpr), y: Math.round(4 * dpr) },
      })
      .setOrigin(0.5);
    this.updateSpeedLabel();

    this.hud = [backZone, back, title, subtitle, speedZone, this.speedLabel];
    for (const o of [backZone, back, title, subtitle, speedZone, this.speedLabel]) {
      o.setDepth(DEPTH.hud);
    }
  }

  /**
   * Whole summon columns and slots are tap targets (thumb-sized by layout). Feedback happens on
   * pointerdown, in the same frame as the touch.
   */
  private createTapZones(): void {
    const add = (r: { x: number; y: number; w: number; h: number }, source: LaunchSource) =>
      this.add
        .zone(r.x, r.y, r.w, r.h)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.tap(source));
    this.zones = [
      ...this.layout.columns.map((r, index) => add(r, { kind: "column", index })),
      ...this.layout.slots.map((r, index) => add(r, { kind: "slot", index })),
    ];
  }

  // ── Input ───────────────────────────────────────────────────────────────

  private tap(source: LaunchSource): void {
    if (this.session.state.status !== "playing") return;
    const id = this.session.tapTarget(source);
    if (id === null) {
      this.rejectTap(source);
      return;
    }
    this.session.tap(source);
    this.haptics.play("tap");
    const view = this.wisps.get(id);
    if (view) {
      // Squish: immediate acknowledgement, even if the launch has to wait for the entry.
      this.tweens.killTweensOf(view);
      view.setScale(0.82);
      this.tweens.add({ targets: view, scale: 1, duration: 180, ease: "Back.easeOut" });
    } else if (source.kind === "column") {
      // The wisp is still hidden in the "+n" part of the stack: pulse that count instead.
      const more = this.moreLabels[source.index];
      if (more) {
        this.tweens.killTweensOf(more);
        more.setScale(1.35);
        this.tweens.add({ targets: more, scale: 1, duration: 200, ease: "Back.easeOut" });
      }
    }
    this.refreshTargets();
  }

  /**
   * Nothing to launch there (empty column or slot, or everything in it already queued): shake the
   * wisp that's there, or flash the empty zone, and buzz.
   */
  private rejectTap(source: LaunchSource): void {
    this.haptics.play("invalid");
    const s = this.session.state;
    const w = source.kind === "column" ? s.columns[source.index]?.[0] : s.slots[source.index];
    const view = w ? this.wisps.get(w.id) : undefined;
    const amplitude = 6 * this.layout.dpr;
    if (view) {
      view.shake(amplitude);
      return;
    }
    const zone =
      source.kind === "column"
        ? this.layout.columns[source.index]
        : this.layout.slots[source.index];
    if (!zone) return;
    const g = this.flashZone(zone);
    const x0 = g.x;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 280,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 1;
        g.x = x0 + amplitude * Math.sin(t * Math.PI * 5) * (1 - t);
      },
    });
  }

  /** A brief outline over an empty zone, used as the thing that shakes. */
  private flashZone(r: {
    x: number;
    y: number;
    w: number;
    h: number;
  }): Phaser.GameObjects.Graphics {
    const g = this.add.graphics({ x: r.x, y: r.y }).setDepth(DEPTH.fx);
    g.lineStyle(Math.max(1, 2 * this.layout.dpr), 0xff8fa3, 0.9);
    g.strokeRoundedRect(0, 0, r.w, Math.min(r.h, r.w), r.w * 0.2);
    this.tweens.add({
      targets: g,
      alpha: 0,
      delay: 200,
      duration: 200,
      onComplete: () => g.destroy(),
    });
    return g;
  }

  private toggleSpeed(): void {
    // The free/ad alternation for 2× arrives with the rewards interface (M5.4).
    this.speed = this.speed === 1 ? 2 : 1;
    this.updateSpeedLabel();
  }

  private updateSpeedLabel(): void {
    this.speedLabel?.setText(`${this.speed}×`).setColor(this.speed === 2 ? "#f6d97a" : theme.text);
  }

  // ── Engine events ───────────────────────────────────────────────────────

  private onEvent(e: SessionEvent): void {
    switch (e.type) {
      case "collected": {
        this.haptics.play("collect");
        this.mosaic?.clearCell(e.cell);
        const view = this.wisps.get(e.wispId);
        if (view) {
          view.setCharge(e.chargeLeft);
          this.spark(e.cell, view);
        }
        break;
      }
      case "portal":
        this.haptics.play("portal");
        this.departToPortal(e.wispId);
        break;
      case "parked":
        this.haptics.play("park");
        break;
      case "won":
        this.haptics.play("win");
        this.recordWin();
        // Let the last wisp reach the portal, then bloom the artwork back in.
        this.revealPending = true;
        this.time.delayedCall(450, () => {
          this.revealPending = false;
          const cells = this.built.level.cells;
          this.reveal = {
            order: revealOrder(this.built.level.width, this.built.level.height, cells),
            shown: 0,
            elapsed: 0,
          };
        });
        break;
      case "lost":
        this.haptics.play("lose");
        getSave(this)?.update((d) => d.stats.losses++);
        this.lossStreaks().set(
          this.built.level.id,
          (this.lossStreaks().get(this.built.level.id) ?? 0) + 1,
        );
        this.time.delayedCall(350, () => {
          if (this.session.state.status === "lost") this.showCard("lose");
        });
        break;
      case "undone":
      case "restarted":
        this.assists = e.type === "undone" ? this.assists + 1 : 0;
        if (e.type === "restarted") getSave(this)?.update((d) => d.stats.plays++);
        this.closeCard();
        for (const view of this.departing) view.destroy();
        this.departing.clear();
        this.rebuildMosaic();
        this.refreshTargets(true);
        break;
      default:
        break;
    }
  }

  /** A fragment flies from its cell into the collecting wisp. */
  private spark(cell: number, view: WispView): void {
    if (!this.mosaic) return;
    const from = this.mosaic.cellCenter(cell);
    const size = this.layout.cell * 0.7;
    const fx = this.add
      .image(from.x, from.y, TEX.spark)
      .setTint(hexToNumber(view.colorHex))
      .setDisplaySize(size, size)
      .setDepth(DEPTH.fx);
    this.tweens.add({
      targets: fx,
      x: view.x,
      y: view.y,
      scale: fx.scale * 0.3,
      duration: 160,
      ease: "Quad.easeIn",
      onComplete: () => fx.destroy(),
    });
    this.tweens.killTweensOf(view);
    view.setScale(1.18);
    this.tweens.add({ targets: view, scale: 1, duration: 140, ease: "Quad.easeOut" });
  }

  private departToPortal(id: number): void {
    const view = this.wisps.get(id);
    this.wisps.delete(id);
    this.targets.delete(id);
    this.flights.delete(id);
    if (!view) return;
    this.tweens.killTweensOf(view);
    this.departing.add(view);
    const { x, y } = this.layout.portal;
    this.tweens.add({
      targets: view,
      x,
      y,
      scale: 0.25,
      alpha: 0,
      duration: 420,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.departing.delete(view);
        view.destroy();
      },
    });
  }

  private rebuildMosaic(): void {
    this.mosaic?.destroy();
    this.mosaic = new MosaicView(this, this.layout, this.built.level, this.session.state.cells);
    this.mosaic.image.setDepth(DEPTH.mosaic);
  }

  // ── Wisp reconciliation ─────────────────────────────────────────────────

  /**
   * Recomputes where every wisp belongs from the session state, creating views for new wisps and
   * removing views for wisps that no longer exist (undo / restart). Track targets reference the
   * engine's live wisp objects, so this only needs to run when something structural changed (an
   * event was emitted), not on every tick. `snapNew` places new views exactly (level start,
   * undo); otherwise wisps surfacing in a column fade in from below.
   */
  private refreshTargets(snapNew = false): void {
    const s = this.session.state;
    const { dpr } = this.layout;
    const palette = this.built.level.palette;
    const next = new Map<number, Target>();

    s.columns.forEach((column, c) => {
      const zone = this.layout.columns[c]!;
      const front = Math.min(zone.w * 0.3, zone.h * 0.16, 30 * dpr);
      column.forEach((w, depth) => {
        if (depth >= VISIBLE_STACK) return;
        next.set(w.id, {
          kind: "rest",
          x: zone.x + zone.w / 2,
          y: zone.y + front * 1.3 + depth * front * 1.75,
          r: front * (1 - depth * 0.18),
          alpha: 1 - depth * 0.3,
        });
      });
      const more = this.moreLabels[c];
      if (more) {
        const hidden = column.length - VISIBLE_STACK;
        more.setVisible(hidden > 0);
        if (hidden > 0) more.setText(`+${hidden}`);
      }
    });

    s.slots.forEach((w, i) => {
      if (!w) return;
      const r = this.layout.slots[i]!;
      next.set(w.id, { kind: "rest", x: r.x + r.w / 2, y: r.y + r.h / 2, r: r.w * 0.32, alpha: 1 });
    });

    for (const w of s.track) {
      next.set(w.id, { kind: "track", wisp: w });
      // Leaving a column or slot: fly onto the track instead of teleporting.
      const view = this.wisps.get(w.id);
      if (view && this.targets.get(w.id)?.kind !== "track") {
        this.flights.set(w.id, {
          from: { x: view.x, y: view.y },
          fromR: view.currentRadius,
          elapsed: 0,
        });
      }
    }

    const all = [...s.columns.flat(), ...s.slots.filter((w) => w !== null), ...s.track];
    for (const w of all) {
      const target = next.get(w.id);
      if (!target || this.wisps.has(w.id)) continue;
      const view = new WispView(this, w.id, palette[w.color]!, w.charge, 1).setDepth(DEPTH.wisps);
      this.wisps.set(w.id, view);
      this.snap(w.id, view, target);
      if (!snapNew && target.kind === "rest") {
        view
          .setPosition(target.x, target.y + target.r * 1.6)
          .setRadius(target.r * 0.7)
          .setAlpha(0);
      }
    }
    this.queued = new Set(this.session.pending);
    for (const w of all) this.wisps.get(w.id)?.setCharge(w.charge).setQueued(this.queued.has(w.id));
    for (const [id, view] of this.wisps) {
      if (!next.has(id)) {
        view.destroy();
        this.wisps.delete(id);
        this.flights.delete(id);
      }
    }
    this.targets = next;
  }

  /** Places a view exactly at its target (new views and relayouts). */
  private snap(id: number, view: WispView, target = this.targets.get(id)): void {
    if (!target) return;
    this.flights.delete(id);
    if (target.kind === "track") {
      const p = trackPosition(this.layout, this.track, target.wisp, this.alpha());
      view.setPosition(p.x, p.y).setRadius(this.trackRadius()).setAlpha(1);
    } else {
      view.setPosition(target.x, target.y).setRadius(target.r).setAlpha(target.alpha);
    }
  }

  private moveWisps(delta: number): void {
    const alpha = this.alpha();
    const trackR = this.trackRadius();
    const pulse = this.queued.size > 0 ? 0.5 + 0.5 * Math.sin(this.time.now / 140) : 0;
    for (const [id, view] of this.wisps) {
      if (this.queued.has(id)) view.pulseRing(pulse);
      const target = this.targets.get(id);
      if (!target) continue;
      if (target.kind === "track") {
        const exact = trackPosition(this.layout, this.track, target.wisp, alpha);
        const flight = this.flights.get(id);
        if (flight) {
          // Fixed-length hop that lands exactly on the moving track point, at any speed.
          flight.elapsed += delta;
          const p = flightPoint(flight.from, exact, flight.elapsed);
          const t = Math.min(1, flight.elapsed / LAUNCH_FLIGHT_MS);
          view.setPosition(p.x, p.y).setRadius(flight.fromR + (trackR - flight.fromR) * t);
          if (t >= 1) this.flights.delete(id);
        } else {
          view.setPosition(exact.x, exact.y).setRadius(trackR);
        }
        view.setAlpha(1);
      } else {
        view.setPosition(approach(view.x, target.x, delta), approach(view.y, target.y, delta));
        view.setRadius(approach(view.currentRadius, target.r, delta));
        view.setAlpha(approach(view.alpha, target.alpha, delta));
      }
    }
  }

  private alpha(): number {
    return this.acc / TICK_MS;
  }

  private trackRadius(): number {
    return this.layout.cell * 0.42;
  }

  // ── End of level ────────────────────────────────────────────────────────

  /** Losses in a row per level this session; after `SKIP_AFTER` the lose card offers a free skip. */
  private lossStreaks(): Map<string, number> {
    let streaks = this.registry.get("lossStreaks") as Map<string, number> | undefined;
    if (!streaks) {
      streaks = new Map();
      this.registry.set("lossStreaks", streaks);
    }
    return streaks;
  }

  /** The level after this one in play order (crossing into the next world), if any. */
  private nextData(): PlayData | null {
    const all = flatLevels(worlds);
    const i = all.findIndex((r) => r.world === this.data_.world && r.level === this.data_.level);
    const next = all[i + 1];
    return next ? { world: next.world, level: next.level } : null;
  }

  /** Never stuck: marks the level skipped (it stays replayable) and moves on. */
  private skipLevel(): void {
    const id = this.built.level.id;
    getSave(this)?.update((d) => {
      if (!d.skipped.includes(id)) d.skipped.push(id);
    });
    this.lossStreaks().delete(id);
    const next = this.nextData();
    if (next) this.scene.restart(next);
    else this.scene.start("levels");
  }

  private recordWin(): void {
    const id = this.built.level.id;
    this.lossStreaks().delete(id);
    const stars = starsFor(this.assists);
    getSave(this)?.update((d) => {
      const prev = d.levels[id];
      d.levels[id] = { stars: Math.max(stars, prev?.stars ?? 0), wins: (prev?.wins ?? 0) + 1 };
      d.stats.wins++;
    });
  }

  private stepReveal(delta: number): void {
    const r = this.reveal!;
    r.elapsed += delta;
    const target = revealedCount(r.order.length, r.elapsed, REVEAL_MS);
    const cells = this.built.level.cells;
    for (; r.shown < target; r.shown++) {
      const cell = r.order[r.shown]!;
      this.mosaic?.paintCell(cell, cells[cell]!);
      // A few sparkles ride the bloom's edge.
      if (r.shown % 9 === 0 && this.mosaic) this.sparkle(this.mosaic.cellCenter(cell));
    }
    if (r.elapsed >= REVEAL_MS) {
      this.reveal = null;
      this.cameras.main.flash(260, 246, 217, 122);
      this.showCard("win");
    }
  }

  /** Paints the first `count` cells of the original artwork in reveal order. */
  private paintArtwork(count: number): void {
    const { width, height, cells } = this.built.level;
    for (const cell of revealOrder(width, height, cells).slice(0, count)) {
      this.mosaic?.paintCell(cell, cells[cell]!);
    }
    this.mosaic?.flush();
  }

  private sparkle(at: { x: number; y: number }): void {
    const size = this.layout.cell * 0.9;
    const s = this.add
      .image(at.x, at.y, TEX.glow)
      .setTint(theme.glow)
      .setDisplaySize(size, size)
      .setDepth(DEPTH.fx);
    this.tweens.add({
      targets: s,
      y: at.y - this.layout.cell * 1.5,
      alpha: 0,
      scale: s.scale * 1.8,
      duration: 600,
      ease: "Quad.easeOut",
      onComplete: () => s.destroy(),
    });
  }

  /**
   * Result card over the lower half of the screen, so a revealed artwork stays visible above it.
   * Win: lore + Continue / Replay. Lose: Retry (always free) and, when possible, Undo.
   */
  private showCard(kind: "win" | "lose", animate = true): void {
    this.closeCard();
    this.overlayKind = kind;
    const { frame, dpr, boardRect } = this.layout;
    const px = (v: number) => Math.round(v * dpr);
    const font = (size: number) => `${px(size)}px`;
    const width = Math.min(frame.w - px(24), px(380));
    const cx = frame.x + frame.w / 2;

    // Swallows taps so nothing behind the card can be launched.
    const blocker = this.add
      .rectangle(
        0,
        0,
        this.scale.gameSize.width,
        this.scale.gameSize.height,
        0x07040f,
        kind === "win" ? 0.25 : 0.55,
      )
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(DEPTH.overlay);

    const card = this.add.container(cx, 0).setDepth(DEPTH.overlay);
    const parts: Phaser.GameObjects.GameObject[] = [];
    let y = px(22);
    const text = (
      value: string,
      size: number,
      color: string,
      style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
    ) => {
      const t = this.add
        .text(0, y, value, {
          fontFamily: theme.font,
          fontSize: font(size),
          color,
          align: "center",
          wordWrap: { width: width - px(40) },
          ...style,
        })
        .setOrigin(0.5, 0);
      parts.push(t);
      y += t.height + px(8);
      return t;
    };

    if (kind === "win") {
      text("✦  Mosaic complete  ✦", 14, "#f6d97a", { fontStyle: "bold" });
      text(this.built.level.name, 24, theme.text, { fontStyle: "bold" });
      text(this.built.lore, 15, theme.textDim, { fontStyle: "italic" });
    } else {
      text("The slots are full", 22, theme.text, { fontStyle: "bold" });
      text(
        "Every wisp needs somewhere to rest. Try launching them in a different order.",
        15,
        theme.textDim,
      );
    }

    y += px(8);
    const gap = px(12);
    const half = (width - px(40) - gap) / 2;
    const left = -half / 2 - gap / 2;
    const right = half / 2 + gap / 2;
    const by = y + px(24);
    if (kind === "win") {
      const next = this.nextData();
      parts.push(
        new Button(this, left, by, half, "Replay", {
          dpr,
          onPress: () => this.scene.restart(this.data_),
        }),
        new Button(this, right, by, half, next ? "Continue" : "Levels", {
          dpr,
          primary: true,
          onPress: () => (next ? this.scene.restart(next) : this.scene.start("levels")),
        }),
      );
    } else {
      const canUndo = this.session.canUndo;
      parts.push(
        new Button(this, canUndo ? left : 0, by, canUndo ? half : width - px(40), "Retry", {
          dpr,
          primary: true,
          onPress: () => this.session.restart(),
        }),
      );
      if (canUndo) {
        parts.push(
          new Button(this, right, by, half, "Undo move", {
            dpr,
            onPress: () => this.session.undo(),
          }),
        );
      }
    }
    let height = by + px(24) + px(22);
    const beaten = Object.hasOwn(getSave(this)?.data.levels ?? {}, this.built.level.id);
    if (
      kind === "lose" &&
      !beaten &&
      (this.lossStreaks().get(this.built.level.id) ?? 0) >= SKIP_AFTER
    ) {
      // Like Button: only a press that starts and ends on the link counts, so a finger lifting
      // off the board as the card appears can't skip by accident.
      let pressed = false;
      const skip = this.add
        .text(0, height + px(4), "Skip this level for now ›", {
          fontFamily: theme.font,
          fontSize: font(14),
          color: theme.textDim,
          padding: { x: px(16), y: px(16) },
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => (pressed = true))
        .on("pointerout", () => (pressed = false))
        .on("pointerup", () => pressed && this.skipLevel());
      parts.push(skip);
      height += skip.height + px(8);
    }

    const panel = this.add.graphics();
    panel.fillStyle(theme.panel, 0.96);
    panel.fillRoundedRect(-width / 2, 0, width, height, px(20));
    panel.lineStyle(Math.max(1, dpr * 1.5), theme.mist, 0.35);
    panel.strokeRoundedRect(-width / 2, 0, width, height, px(20));
    card.add([panel, ...parts]);

    // Centered in the space below the board; on short screens anchored to the bottom so it covers
    // as little of the (revealed) artwork as possible.
    const below = frame.y + frame.h - (boardRect.y + boardRect.h);
    const top =
      below >= height + px(16)
        ? boardRect.y + boardRect.h + (below - height) / 2
        : frame.y + frame.h - height - px(12);
    card.y = top;
    if (animate) {
      card.y = top + px(40);
      card.setAlpha(0);
      this.tweens.add({ targets: card, y: top, alpha: 1, duration: 320, ease: "Back.easeOut" });
    }
    this.overlay = [blocker, card];
  }

  private closeCard(): void {
    for (const o of this.overlay) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    this.overlay = [];
    this.overlayKind = null;
  }
}
