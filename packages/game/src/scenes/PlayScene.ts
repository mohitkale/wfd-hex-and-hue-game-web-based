import Phaser from "phaser";
import {
  GameSession,
  trackFor,
  type BuiltLevel,
  type LaunchSource,
  type SessionEvent,
  type TrackCell,
} from "@hexhue/core";
import { computeLayout, type Insets, type Layout } from "../layout";
import { levelAt, worlds } from "../levels";
import { TICK_MS, accumulate, approach, trackPosition, type Speed } from "../motion";
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
  | { kind: "track"; pos: number; traveled: number }
  | { kind: "rest"; x: number; y: number; r: number; alpha: number };

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
  private extras: Phaser.GameObjects.Text[] = [];
  private wisps = new Map<number, WispView>();
  private targets = new Map<number, Target>();
  private speedLabel: Phaser.GameObjects.Text | null = null;
  private banner: Phaser.GameObjects.GameObject[] = [];
  private lastLayoutKey = "";
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
    this.extras = [];
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
    this.scale.on("resize", this.relayout, this);
    this.events.once("shutdown", () => {
      unsubscribe();
      this.scale.off("resize", this.relayout, this);
      this.mosaic?.destroy();
      this.mosaic = null;
    });
    this.relayout();
  }

  override update(_time: number, delta: number): void {
    if (this.session.state.status === "playing") {
      const { steps, acc } = accumulate(this.acc, delta, this.speed);
      this.acc = acc;
      for (let i = 0; i < steps; i++) this.session.tick();
      if (steps > 0) this.refreshTargets();
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

    for (const o of [...this.chrome, ...this.hud, ...this.zones]) o.destroy();
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
    this.refreshTargets();
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

  /** Whole summon columns and slots are tap targets; M3.3 adds feedback. */
  private createTapZones(): void {
    const add = (r: { x: number; y: number; w: number; h: number }, source: LaunchSource) =>
      this.add
        .zone(r.x, r.y, r.w, r.h)
        .setOrigin(0, 0)
        .setInteractive()
        .on("pointerdown", () => this.tap(source));
    this.zones = [
      ...this.layout.columns.map((r, index) => add(r, { kind: "column", index })),
      ...this.layout.slots.map((r, index) => add(r, { kind: "slot", index })),
    ];
  }

  // ── Input ───────────────────────────────────────────────────────────────

  private tap(source: LaunchSource): void {
    if (this.session.state.status !== "playing") return;
    if (this.session.tap(source).length > 0) this.refreshTargets();
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
        this.mosaic?.clearCell(e.cell);
        const view = this.wisps.get(e.wispId);
        if (view) {
          view.setCharge(e.chargeLeft);
          this.spark(e.cell, view);
        }
        break;
      }
      case "portal":
        this.departToPortal(e.wispId);
        break;
      case "won":
        this.time.delayedCall(500, () => this.showBanner("Mosaic complete!", "Next level"));
        break;
      case "lost":
        this.time.delayedCall(300, () => this.showBanner("No room left", "Try again"));
        break;
      case "undone":
      case "restarted":
        this.rebuildMosaic();
        this.refreshTargets();
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
    if (!view) return;
    this.tweens.killTweensOf(view);
    const { x, y } = this.layout.portal;
    this.tweens.add({
      targets: view,
      x,
      y,
      scale: 0.25,
      alpha: 0,
      duration: 420,
      ease: "Cubic.easeIn",
      onComplete: () => view.destroy(),
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
   * removing views for wisps that no longer exist (undo / restart).
   */
  private refreshTargets(): void {
    const s = this.session.state;
    const { dpr } = this.layout;
    const palette = this.built.level.palette;
    const next = new Map<number, Target>();
    for (const t of this.extras) t.destroy();
    this.extras = [];

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
      if (column.length > VISIBLE_STACK) {
        const more = this.add
          .text(
            zone.x + zone.w / 2,
            zone.y + zone.h - 10 * dpr,
            `+${column.length - VISIBLE_STACK}`,
            {
              fontFamily: theme.font,
              fontSize: `${Math.round(12 * dpr)}px`,
              color: theme.textDim,
            },
          )
          .setOrigin(0.5, 1)
          .setDepth(DEPTH.wisps);
        this.extras.push(more);
      }
    });

    s.slots.forEach((w, i) => {
      if (!w) return;
      const r = this.layout.slots[i]!;
      next.set(w.id, { kind: "rest", x: r.x + r.w / 2, y: r.y + r.h / 2, r: r.w * 0.32, alpha: 1 });
    });

    for (const w of s.track) {
      next.set(w.id, { kind: "track", pos: w.pos, traveled: w.traveled });
    }

    const all = [...s.columns.flat(), ...s.slots.filter((w) => w !== null), ...s.track];
    for (const w of all) {
      if (!next.has(w.id) || this.wisps.has(w.id)) continue;
      const view = new WispView(this, w.id, palette[w.color]!, w.charge, 1).setDepth(DEPTH.wisps);
      this.wisps.set(w.id, view);
      this.snap(w.id, view, next.get(w.id));
    }
    for (const w of all) this.wisps.get(w.id)?.setCharge(w.charge);
    for (const [id, view] of this.wisps) {
      if (!next.has(id)) {
        view.destroy();
        this.wisps.delete(id);
      }
    }
    this.targets = next;
  }

  /** Places a view exactly at its target (new views and relayouts). */
  private snap(id: number, view: WispView, target = this.targets.get(id)): void {
    if (!target) return;
    if (target.kind === "track") {
      const p = trackPosition(this.layout, this.track, target, this.alpha());
      view.setPosition(p.x, p.y).setRadius(this.trackRadius()).setAlpha(1);
    } else {
      view.setPosition(target.x, target.y).setRadius(target.r).setAlpha(target.alpha);
    }
  }

  private moveWisps(delta: number): void {
    const alpha = this.alpha();
    const trackR = this.trackRadius();
    for (const [id, view] of this.wisps) {
      const target = this.targets.get(id);
      if (!target) continue;
      if (target.kind === "track") {
        const p = trackPosition(this.layout, this.track, target, alpha);
        // Ride the track exactly once close; ease in when arriving from a column or slot.
        const far = Math.hypot(p.x - view.x, p.y - view.y) > this.layout.cell * 1.2;
        view.setPosition(
          far ? approach(view.x, p.x, delta, 22) : p.x,
          far ? approach(view.y, p.y, delta, 22) : p.y,
        );
        view.setRadius(approach(view.currentRadius, trackR, delta, 22));
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
