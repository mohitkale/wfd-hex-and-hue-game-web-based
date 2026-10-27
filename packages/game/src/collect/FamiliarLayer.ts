import type * as collect from "@hexhue/core/collect";
import Phaser from "phaser";
import { hexToNumber, inkFor } from "../theme";
import { symbolTexture } from "../view/textures";
import type { CollectLayout } from "./collectLayout";
import { spriteScaleForCell } from "./collectLayout";
import { TEX } from "../view/textures";
import { bake } from "./bake";
import { paintCube, type CubeTones } from "./cubePaint";
import {
  FAMILIAR_H,
  FAMILIAR_W,
  FRAME_NAMES,
  SS,
  badgeRect,
  type FrameName,
  type Species,
} from "./familiarArt";
import type { Emitter } from "./particles";
import {
  CellSpreader,
  bump,
  squashX,
  squashY,
  drawnCoord,
  drift,
  ease,
  hover as hoverOf,
  interpolate,
  popDuration,
  type Offset,
} from "./swarm";
import { frameFor, type FamiliarVisual, type VisualModel } from "./visuals";

type CollectEvent = collect.CollectEvent;

interface Entry {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  cube: Phaser.GameObjects.Image;
  cubeColor: number;
  /** Colour-blind symbols: one on the chest, one on the carried cube (null when the mode is off). */
  chest: Phaser.GameObjects.Image | null;
  mark: Phaser.GameObjects.Image | null;
  retiring: boolean;
  popping: boolean;
  /** Per-familiar constants (drift, hover, pop length), set once when the entry is attached to an id. */
  drift: Offset;
  hoverPhase: number;
  hoverRate: number;
  popMs: number;
  /** The eased crowd offset (cells) currently applied, so it glides instead of snapping. */
  spread: number;
  /** Pickup lift: the carried cube rises from the cube's cell to above the head (decorative, timed). */
  liftFromX: number;
  liftFromY: number;
  liftUntil: number;
  /** Pickup squash: the familiar flattens and springs back until this time. */
  squashUntil: number;
  /** When this carrier last left a trail puff. */
  trailAt: number;
}

const D = { shadow: 4, sprite: 5, cube: 6, effect: 8 } as const;
const SHADOW_ALPHA = 0.35;
/** The pickup squash lasts this many ticks (so it is twice as quick in wall time at 2×). */
const SQUASH_TICKS = 2;
const FRAME_INDEX = Object.fromEntries(FRAME_NAMES.map((n, i) => [n, i])) as Record<
  FrameName,
  number
>;

/**
 * Draws the familiars from the visual model: pooled sprites, a carried cube above the head, a soft
 * shadow, and the effects for spawning, picking up, delivering and retiring. It reads state from the
 * model and never touches game state. Per-frame work allocates nothing (frame names are
 * precomputed, positions are plain numbers).
 */
export class FamiliarLayer {
  private readonly entries = new Map<number, Entry>();
  private readonly pool: Entry[] = [];
  /** `frameNames[colorIndex][frameIndex]`: the atlas frame names, built once. */
  private readonly frameNames: string[][];
  private now = 0;
  private tickMs = 42;
  /** Frames left in which new sprites appear without the pop-in (after a rebuild mid-game). */
  private quietFrames = 2;
  private readonly spreader = new CellSpreader();
  /** One baked texture per palette colour for the carried and delivered cube. */
  private readonly cubeKeys: string[];
  /** Counters for the profiler (`?profile=1`): sprites ever created, and the live/pooled counts. */
  readonly stats = { created: 0, peakLive: 0, live: 0 };
  /** Called when a cube lands in the portal: (palette index, group id). */
  onDelivered: (colorIndex: number, group: number) => void = () => undefined;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: CollectLayout,
    private readonly atlas: string,
    private readonly model: VisualModel,
    private readonly tones: readonly CubeTones[],
    private readonly reduced: boolean,
    /** Palette hex colours when colour-blind symbols are on, otherwise null. */
    private readonly symbolPalette: readonly string[] | null = null,
    private readonly emitter: Emitter | null = null,
    private readonly species: Species = "bat",
  ) {
    this.frameNames = tones.map((_, c) => FRAME_NAMES.map((f) => `${c}:${f}`));
    const size = Math.max(4, Math.round(layout.cell * 0.82));
    this.cubeKeys = tones.map((tone, c) =>
      bake(scene, `cube:${c}:${tone.base}:${size}`, size, size, (g) =>
        paintCube(g, 0, 0, size, tone),
      ),
    );
  }

  private get scale(): number {
    return spriteScaleForCell(this.layout.cell);
  }

  /** Where a group's familiars come out of and return to: its box's open tray (set by the scene). */
  anchorFor: (group: number) => { x: number; y: number } | null = () => null;

  /**
   * The portal cell is where a familiar's route starts and ends; it is drawn at the tray of its own
   * group's box instead (or, with no box, at the walkway cell), so the familiars visibly leave the box.
   */
  private cx(cell: number, group?: number): number {
    if (cell === this.model.portal) {
      return (group === undefined ? null : this.anchorFor(group))?.x ?? this.layout.portal.x;
    }
    return this.layout.boardRect.x + ((cell % this.layout.stride) + 0.5) * this.layout.cell;
  }

  private cy(cell: number, group?: number): number {
    if (cell === this.model.portal) {
      return (group === undefined ? null : this.anchorFor(group))?.y ?? this.layout.portal.y;
    }
    return (
      this.layout.boardRect.y + (Math.floor(cell / this.layout.stride) + 0.5) * this.layout.cell
    );
  }

  private acquire(): Entry {
    const reused = this.pool.pop();
    if (reused) {
      reused.img.setVisible(true);
      reused.shadow.setVisible(true);
      return reused;
    }
    this.stats.created++;
    const img = this.scene.add
      .image(0, 0, this.atlas, "0:idle0")
      .setOrigin(0.5, 0.78)
      .setDepth(D.sprite);
    const shadow = this.scene.add
      .image(0, 0, TEX.glow)
      .setTint(0x000000)
      .setAlpha(SHADOW_ALPHA)
      .setDepth(D.shadow);
    const cube = this.scene.add.image(0, 0, this.cubeKeys[0]!).setDepth(D.cube).setVisible(false);
    const chest = this.symbolPalette
      ? this.scene.add
          .image(0, 0, symbolTexture(this.scene, 0))
          .setDepth(D.sprite + 0.2)
          .setVisible(false)
      : null;
    const mark = this.symbolPalette
      ? this.scene.add
          .image(0, 0, symbolTexture(this.scene, 0))
          .setDepth(D.cube + 0.2)
          .setVisible(false)
      : null;
    return {
      img,
      shadow,
      cube,
      chest,
      mark,
      cubeColor: -1,
      retiring: false,
      popping: false,
      drift: { x: 0, y: 0 },
      hoverPhase: 0,
      hoverRate: 1,
      popMs: 140,
      spread: 0,
      liftFromX: 0,
      liftFromY: 0,
      liftUntil: 0,
      squashUntil: 0,
      trailAt: -Infinity,
    };
  }

  private release(e: Entry): void {
    this.scene.tweens.killTweensOf([e.img, e.shadow, e.cube]);
    e.img.setVisible(false).setScale(1).setAlpha(1);
    e.shadow.setVisible(false).setAlpha(SHADOW_ALPHA);
    e.cube.setVisible(false).setAlpha(1);
    e.chest?.setVisible(false);
    e.mark?.setVisible(false);
    e.retiring = false;
    e.popping = false;
    e.cubeColor = -1;
    e.liftUntil = 0;
    e.squashUntil = 0;
    e.trailAt = -Infinity;
    this.pool.push(e);
  }

  /** Effects driven by events (the model already holds the state). */
  handle(e: CollectEvent): void {
    if (e.type === "cubeDelivered") {
      this.flyCubeIntoPortal(e.color, e.group);
    } else if (e.type === "cubePickedUp") {
      const entry = this.entries.get(e.familiar);
      if (entry && !this.reduced) {
        entry.liftFromX = this.cx(e.cube);
        entry.liftFromY = this.cy(e.cube);
        entry.liftUntil = this.now + this.tickMs * 3;
        entry.squashUntil = this.now + this.tickMs * SQUASH_TICKS;
      }
    }
  }

  /**
   * Per-frame update: place, pose and tint every sprite. `tick` is the engine tick, `alpha` the
   * progress through it, `timeMs` wall time and `tickMs` the current tick length (it shortens at 2×).
   */
  update(tick: number, alpha: number, timeMs: number, tickMs: number): void {
    this.now = timeMs;
    this.tickMs = tickMs;
    if (this.emitter) this.emitter.tickMs = tickMs;
    const s = this.scale;
    const cell = this.layout.cell;
    const cubeSize = Math.max(4, Math.round(cell * 0.82));
    const lift = FAMILIAR_H * s * 0.78 + cubeSize * 0.1;
    const quiet = this.quietFrames > 0;
    // Familiars standing on one cell fan out sideways so none hides another (cosmetic only).
    const spreader = this.spreader;
    spreader.begin();
    for (const v of this.model.familiars.values()) spreader.add(v.id, v.to);
    spreader.finish();
    if (this.model.familiars.size > this.stats.peakLive)
      this.stats.peakLive = this.model.familiars.size;
    let live = 0;
    for (const v of this.model.familiars.values()) {
      let e = this.entries.get(v.id);
      if (!e) {
        e = this.acquire();
        this.entries.set(v.id, e);
        e.drift = drift(v.id);
        const h = hoverOf(v.id);
        e.hoverPhase = h.phase;
        e.hoverRate = h.rate;
        e.popMs = popDuration(v.id);
        e.spread = spreader.offset(v.id);
        if (!this.reduced && !quiet && v.mode !== "retiring") this.popIn(e, s, e.popMs);
      }
      const frame = this.frameNames[v.colorIndex]![FRAME_INDEX[frameFor(v, tick)]]!;
      if (e.img.frame.name !== frame) e.img.setFrame(frame);

      // Position: interpolate along this tick's move, otherwise stand on the cell. Each familiar
      // keeps its own drift off the centre and glides to its share of a crowded cell (cosmetic
      // only; reduced motion keeps it, as it is placement, not motion).
      const moving = v.mode === "walk" || v.mode === "carry";
      const toX = this.cx(v.to, v.group);
      const toY = this.cy(v.to, v.group);
      e.spread = ease(e.spread, spreader.offset(v.id));
      const x = drawnCoord(
        moving ? interpolate(this.cx(v.from, v.group), toX, alpha) : toX,
        e.drift.x,
        e.spread,
        cell,
      );
      const y = drawnCoord(
        moving ? interpolate(this.cy(v.from, v.group), toY, alpha) : toY,
        e.drift.y,
        0,
        cell,
      );
      // A gentle hover while moving or waiting, out of step between familiars; none for reduced motion.
      const hover =
        this.reduced || v.mode === "pickup" || v.mode === "deliver"
          ? 0
          : Math.sin((timeMs / 110) * e.hoverRate + e.hoverPhase) * s * 0.7;
      e.img.setPosition(x, y + hover);
      if (!e.retiring && !e.popping) {
        // Pickup squash: flatten a little and spring back over a couple of ticks (never delays play).
        if (timeMs < e.squashUntil) {
          const b = bump(1 - (e.squashUntil - timeMs) / (this.tickMs * SQUASH_TICKS));
          e.img.setScale(squashX(s, b) / SS, squashY(s, b) / SS);
        } else {
          e.img.setScale(s / SS);
        }
      }
      e.shadow.setPosition(x, y + s * 2.2);
      if (!e.retiring && !e.popping) e.shadow.setDisplaySize(s * 11, s * 4);

      // The carried cube rides above the head from the grab until the drop, rising from its cell.
      if (v.carried !== null && v.mode !== "retiring") {
        if (e.cubeColor !== v.carried) {
          e.cubeColor = v.carried;
          e.cube.setTexture(this.cubeKeys[v.carried]!);
        }
        let cubeX = x;
        let cubeY = y - lift + hover;
        if (timeMs < e.liftUntil) {
          const k = 1 - (e.liftUntil - timeMs) / (this.tickMs * 3);
          const eased = 1 - (1 - k) * (1 - k);
          cubeX = e.liftFromX + (cubeX - e.liftFromX) * eased;
          cubeY = e.liftFromY + (cubeY - e.liftFromY) * eased;
        }
        e.cube
          .setPosition(cubeX, cubeY)
          .setVisible(true)
          .setScale(v.mode === "pickup" ? 1.15 : 1);
        if (e.mark) this.placeMark(e, v, cubeX, cubeY, cubeSize);
      } else {
        e.cube.setVisible(false);
        e.mark?.setVisible(false);
        e.cubeColor = -1;
      }
      if (this.emitter && v.mode === "carry" && v.carried !== null) {
        e.trailAt = this.emitter.trail(
          x,
          y + hover + s * 1.5,
          this.tones[v.carried]!.light,
          timeMs,
          e.trailAt,
        );
      }
      if (e.chest) this.placeChest(e, v, frameFor(v, tick), x, y + hover);
      if (v.mode === "retiring" && !e.retiring) this.retire(v.id, e);
      if (!e.retiring) live++;
    }
    // Sprites whose familiar vanished from the model (restart/undo) are released.
    for (const [id, e] of this.entries) {
      if (!this.model.familiars.has(id)) {
        this.release(e);
        this.entries.delete(id);
      }
    }
    this.stats.live = live;
    if (this.quietFrames > 0) this.quietFrames--;
  }

  /** Colour-blind symbol on the chest, at the frame's badge anchor, following the sprite's current scale. */
  private placeChest(e: Entry, v: FamiliarVisual, frame: FrameName, x: number, y: number): void {
    if (!this.symbolPalette || !e.chest) return;
    const r = badgeRect(frame, this.species);
    const s = e.img.scaleX * SS; // not the target scale: the sprite may be mid pop-in
    const size = Math.min(r.w, r.h) * s * 0.95;
    e.chest
      .setTexture(symbolTexture(this.scene, v.colorIndex))
      .setTint(hexToNumber(inkFor(this.symbolPalette[v.colorIndex]!)))
      .setPosition(
        x + (r.x + r.w / 2 - FAMILIAR_W / 2) * s,
        y + (r.y + r.h / 2 - FAMILIAR_H * 0.78) * s,
      )
      .setDisplaySize(size, size)
      .setVisible(!e.retiring);
  }

  private placeMark(e: Entry, v: FamiliarVisual, x: number, y: number, cubeSize: number): void {
    if (!this.symbolPalette || !e.mark) return;
    e.mark
      .setTexture(symbolTexture(this.scene, v.colorIndex))
      .setTint(hexToNumber(inkFor(this.symbolPalette[v.colorIndex]!)))
      .setPosition(x, y)
      .setDisplaySize(cubeSize * 0.62, cubeSize * 0.62)
      .setVisible(!e.retiring);
  }

  private popIn(e: Entry, s: number, ms: number): void {
    e.popping = true;
    e.img.setScale((s * 0.2) / SS);
    e.shadow.setDisplaySize(s * 2, s).setAlpha(0);
    this.scene.tweens.add({
      targets: e.img,
      scale: s / SS,
      duration: ms,
      ease: "Back.easeOut",
      onComplete: () => {
        e.popping = false;
      },
    });
    this.scene.tweens.add({
      targets: e.shadow,
      alpha: SHADOW_ALPHA,
      duration: ms,
      ease: "Sine.easeOut",
    });
  }

  private retire(id: number, e: Entry): void {
    e.retiring = true;
    const group = this.model.familiars.get(id)?.group;
    if (this.reduced) {
      this.finishRetire(id);
      return;
    }
    this.scene.tweens.add({
      targets: e.img,
      x: this.cx(this.model.portal, group),
      y: this.cy(this.model.portal, group),
      scale: (this.scale * 0.15) / SS,
      alpha: 0,
      duration: 170,
      ease: "Sine.easeIn",
      onComplete: () => this.finishRetire(id),
    });
    this.scene.tweens.add({ targets: e.shadow, alpha: 0, duration: 170 });
  }

  private finishRetire(id: number): void {
    const e = this.entries.get(id);
    this.model.remove(id);
    if (e) {
      this.release(e);
      this.entries.delete(id);
    }
  }

  /** The cube arcs from above the group's box into its open tray, with a small burst where it lands. */
  private flyCubeIntoPortal(colorIndex: number, group: number): void {
    const tone = this.tones[colorIndex];
    if (!tone || this.reduced) {
      this.onDelivered(colorIndex, group);
      return;
    }
    const px = this.cx(this.model.portal, group);
    const py = this.cy(this.model.portal, group);
    const g = this.scene.add
      .image(px, py - FAMILIAR_H * this.scale * 0.78, this.cubeKeys[colorIndex]!)
      .setDepth(D.effect);
    this.scene.tweens.add({
      targets: g,
      y: py,
      scale: 0.25,
      alpha: 0.2,
      duration: 150,
      ease: "Cubic.easeIn",
      onComplete: () => {
        g.destroy();
        this.emitter?.sparks(px, py, tone.light, 6, this.now);
        this.onDelivered(colorIndex, group);
      },
    });
  }
}
