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
import { drawBoardChrome } from "../view/BoardChrome";
import { MosaicView } from "../view/MosaicView";
import { WispView } from "../view/WispView";
import { TEX, ensureTextures } from "../view/textures";

export interface PlayData {
  world: number;
  level: number;
}

/** Draw order; explicit so rebuilt layers never cover persistent wisps. */
const DEPTH = { chrome: 0, mosaic: 1, wisps: 2, fx: 3, hud: 4 } as const;

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
  /** Spent wisps still animating into the portal. */
  private departing = new Set<WispView>();
  private speedLabel: Phaser.GameObjects.Text | null = null;
  private banner: Phaser.GameObjects.GameObject[] = [];
  private lastLayoutKey = "";
  private readonly haptics = new Haptics();
  private acc = 0;
  private speed: Speed = 1;

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
    this.departing = new Set();
    this.banner = [];
    this.speedLabel = null;
    this.lastLayoutKey = "";
    this.acc = 0;
    this.speed = 1;

    ensureTextures(this);
    this.cameras.main.setBackgroundColor(theme.night);
    const level = this.built.level;
    this.track = trackFor(level.width, level.height);
    this.session = new GameSession(level);
    const unsubscribe = this.session.subscribe((e) => this.onEvent(e));
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const source = keyToSource(e.key, level.columns.length, this.session.state.slots.length);
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
      .on("pointerup", () => this.scene.start("boot"));
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
    for (const o of [back, title, subtitle, this.speedLabel]) o.setDepth(DEPTH.hud);
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
    if (id === null || this.session.tap(source).length === 0) {
      this.rejectTap(source);
      return;
    }
    this.haptics.play("tap");
    const view = this.wisps.get(id);
    if (view) {
      // Squish: immediate acknowledgement, even if the launch has to wait for the entry.
      this.tweens.killTweensOf(view);
      view.setScale(0.82);
      this.tweens.add({ targets: view, scale: 1, duration: 180, ease: "Back.easeOut" });
    }
    this.refreshTargets();
  }

  /** Nothing to launch there (empty column or slot, or already queued): shake and buzz. */
  private rejectTap(source: LaunchSource): void {
    this.haptics.play("invalid");
    const s = this.session.state;
    const w =
      source.kind === "column"
        ? s.columns[source.index]?.find((x) => !this.session.pending.includes(x.id))
        : s.slots[source.index];
    const view = w ? this.wisps.get(w.id) : undefined;
    const zone =
      source.kind === "column"
        ? this.layout.columns[source.index]
        : this.layout.slots[source.index];
    if (!zone) return;
    const target: Phaser.GameObjects.GameObject & { x: number } = view ?? this.flashZone(zone);
    const x0 = target.x;
    const d = 6 * this.layout.dpr;
    this.tweens.add({
      targets: target,
      x: { from: x0 - d, to: x0 },
      duration: 260,
      ease: (t: number) => Math.sin(t * Math.PI * 5) * (1 - t) + t,
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
        this.time.delayedCall(500, () => this.showBanner("Mosaic complete!", "Next level"));
        break;
      case "lost":
        this.haptics.play("lose");
        this.time.delayedCall(300, () => this.showBanner("No room left", "Try again"));
        break;
      case "undone":
      case "restarted":
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
    for (const w of all) this.wisps.get(w.id)?.setCharge(w.charge);
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
    const pending = this.session.pending;
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 140);
    for (const [id, view] of this.wisps) {
      view.setQueued(pending.includes(id), pulse);
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

  // ── Placeholder end-of-level banner (M3.4 replaces this) ────────────────

  private showBanner(text: string, action: string): void {
    for (const o of this.banner) o.destroy();
    const { frame, dpr, boardRect } = this.layout;
    const cx = frame.x + frame.w / 2;
    const cy = boardRect.y + boardRect.h / 2;
    const title = this.add
      .text(cx, cy - 18 * dpr, text, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(26 * dpr)}px`,
        color: theme.text,
        backgroundColor: "#140b2ecc",
        padding: { x: Math.round(16 * dpr), y: Math.round(10 * dpr) },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);
    const button = this.add
      .text(cx, cy + 34 * dpr, action, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(18 * dpr)}px`,
        color: "#140b2e",
        backgroundColor: "#f6d97a",
        padding: { x: Math.round(18 * dpr), y: Math.round(10 * dpr) },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => {
        const won = this.session.state.status === "won";
        const nextLevel = this.data_.level + 1;
        const hasNext = levelAt(this.data_.world, nextLevel) !== null;
        this.scene.restart(
          won && hasNext ? { world: this.data_.world, level: nextLevel } : this.data_,
        );
      });
    this.banner = [title, button];
  }
}
