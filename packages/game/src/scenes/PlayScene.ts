import Phaser from "phaser";
import { GameSession, type BuiltLevel, type Wisp } from "@hexhue/core";
import { computeLayout, type Insets, type Layout } from "../layout";
import { levelAt, worlds } from "../levels";
import { theme } from "../theme";
import { drawBoardChrome } from "../view/BoardChrome";
import { MosaicView } from "../view/MosaicView";
import { WispView } from "../view/WispView";
import { ensureTextures } from "../view/textures";

export interface PlayData {
  world: number;
  level: number;
}

/** Draw order; explicit so rebuilt layers never cover persistent wisps. */
const DEPTH = { chrome: 0, mosaic: 1, wisps: 2, hud: 3 } as const;

/** How many wisps of each summon column are drawn (the rest show as "+n"). */
const VISIBLE_STACK = 3;

export class PlayScene extends Phaser.Scene {
  private data_!: PlayData;
  private built!: BuiltLevel;
  private session!: GameSession;
  private layout!: Layout;
  private mosaic: MosaicView | null = null;
  private chrome: Phaser.GameObjects.GameObject[] = [];
  private hud: Phaser.GameObjects.GameObject[] = [];
  private wisps = new Map<number, WispView>();
  private extras: Phaser.GameObjects.Text[] = [];
  private lastLayoutKey = "";

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
    this.mosaic = null;
    this.chrome = [];
    this.hud = [];
    this.extras = [];
    this.lastLayoutKey = "";

    ensureTextures(this);
    this.cameras.main.setBackgroundColor(theme.night);
    this.session = new GameSession(this.built.level);
    this.scale.on("resize", this.relayout, this);
    this.events.once("shutdown", () => {
      this.scale.off("resize", this.relayout, this);
      this.mosaic?.destroy();
      this.mosaic = null;
    });
    this.relayout();
  }

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

    for (const o of [...this.chrome, ...this.hud]) o.destroy();
    this.mosaic?.destroy();
    this.chrome = drawBoardChrome(
      this,
      this.layout,
      level.width,
      level.height,
      this.session.state.slots.length,
    );
    for (const o of this.chrome)
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH.chrome);
    this.mosaic = new MosaicView(this, this.layout, level, this.session.state.cells);
    this.mosaic.image.setDepth(DEPTH.mosaic);
    this.drawHud();
    this.placeWisps();
  }

  private drawHud(): void {
    const { hud, dpr } = this.layout;
    const world = worlds[this.data_.world]!;
    const touch = 48 * dpr;
    const backZone = this.add
      .zone(hud.x + 4 * dpr, hud.y + (hud.h - touch) / 2, touch, touch)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.scene.start("boot"));
    const back = this.add
      .text(backZone.x + touch / 2, hud.y + hud.h / 2, "‹", {
        fontFamily: theme.font,
        fontSize: `${Math.round(34 * dpr)}px`,
        color: theme.text,
      })
      .setOrigin(0.5, 0.55);
    const title = this.add
      .text(hud.x + hud.w / 2, hud.y + hud.h / 2 - 8 * dpr, this.built.level.name, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(18 * dpr)}px`,
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
          fontSize: `${Math.round(12 * dpr)}px`,
          color: theme.textDim,
        },
      )
      .setOrigin(0.5);
    this.hud = [backZone, back, title, subtitle];
    for (const o of [back, title, subtitle]) o.setDepth(DEPTH.hud);
  }

  /**
   * Creates or moves a view for every wisp in the columns and slots. Static placement only: M3.2
   * replaces this with a per-frame reconciler over columns, slots and the track.
   */
  private placeWisps(): void {
    const s = this.session.state;
    const palette = this.built.level.palette;
    const seen = new Set<number>();
    for (const t of this.extras) t.destroy();
    this.extras = [];

    s.columns.forEach((column, c) => {
      const zone = this.layout.columns[c]!;
      const front = Math.min(zone.w * 0.3, zone.h * 0.16, 30 * this.layout.dpr);
      column.forEach((w, depth) => {
        if (depth >= VISIBLE_STACK) return;
        const r = front * (1 - depth * 0.18);
        const y = zone.y + front * 1.3 + depth * front * 1.75;
        this.place(w, palette, zone.x + zone.w / 2, y, r, 1 - depth * 0.3);
        seen.add(w.id);
      });
      if (column.length > VISIBLE_STACK) {
        const more = this.add
          .text(
            zone.x + zone.w / 2,
            zone.y + zone.h - 10 * this.layout.dpr,
            `+${column.length - VISIBLE_STACK}`,
            {
              fontFamily: theme.font,
              fontSize: `${Math.round(12 * this.layout.dpr)}px`,
              color: theme.textDim,
            },
          )
          .setOrigin(0.5, 1);
        more.setDepth(DEPTH.wisps);
        this.extras.push(more);
      }
    });

    s.slots.forEach((w, i) => {
      if (!w) return;
      const r = this.layout.slots[i]!;
      this.place(w, palette, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.32, 1);
      seen.add(w.id);
    });

    for (const [id, view] of this.wisps) {
      if (!seen.has(id)) {
        view.destroy();
        this.wisps.delete(id);
      }
    }
  }

  private place(w: Wisp, palette: string[], x: number, y: number, r: number, alpha: number): void {
    let view = this.wisps.get(w.id);
    if (!view) {
      view = new WispView(this, w.id, palette[w.color]!, w.charge, r);
      view.setDepth(DEPTH.wisps);
      this.wisps.set(w.id, view);
    }
    view.setPosition(x, y).setRadius(r).setCharge(w.charge).setAlpha(alpha);
  }
}
