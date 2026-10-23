import type * as collect from "@hexhue/core/collect";
import Phaser from "phaser";
import { hexToNumber, inkFor } from "../theme";
import { symbolTexture } from "../view/textures";
import type { CollectLayout } from "./collectLayout";
import { spriteScaleForCell } from "./collectLayout";
import { paintCube, type CubeTones } from "./cubePaint";
import { FAMILIAR_H, FAMILIAR_W, FRAME_NAMES, badgeRect, type FrameName } from "./familiarArt";
import { frameFor, type FamiliarVisual, type VisualModel } from "./visuals";

type CollectEvent = collect.CollectEvent;

interface Entry {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  cube: Phaser.GameObjects.Graphics;
  cubeColor: number;
  /** Colour-blind symbols: one on the chest, one on the carried cube (null when the mode is off). */
  chest: Phaser.GameObjects.Image | null;
  mark: Phaser.GameObjects.Image | null;
  retiring: boolean;
  popping: boolean;
  /** Pickup lift: the carried cube rises from the cube's cell to above the head (decorative, timed). */
  liftFromX: number;
  liftFromY: number;
  liftUntil: number;
}

const D = { shadow: 4, sprite: 5, cube: 6, effect: 8 } as const;
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
  ) {
    this.frameNames = tones.map((_, c) => FRAME_NAMES.map((f) => `${c}:${f}`));
  }

  private get scale(): number {
    return spriteScaleForCell(this.layout.cell);
  }

  private cx(cell: number): number {
    return this.layout.boardRect.x + ((cell % this.layout.stride) + 0.5) * this.layout.cell;
  }

  private cy(cell: number): number {
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
    const img = this.scene.add
      .image(0, 0, this.atlas, "0:idle0")
      .setOrigin(0.5, 0.78)
      .setDepth(D.sprite);
    const shadow = this.scene.add.ellipse(0, 0, 10, 4, 0x000000, 0.32).setDepth(D.shadow);
    const cube = this.scene.add.graphics().setDepth(D.cube).setVisible(false);
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
      liftFromX: 0,
      liftFromY: 0,
      liftUntil: 0,
    };
  }

  private release(e: Entry): void {
    this.scene.tweens.killTweensOf([e.img, e.shadow, e.cube]);
    e.img.setVisible(false).setScale(1).setAlpha(1);
    e.shadow.setVisible(false).setAlpha(0.32);
    e.cube.setVisible(false).setAlpha(1);
    e.chest?.setVisible(false);
    e.mark?.setVisible(false);
    e.retiring = false;
    e.popping = false;
    e.cubeColor = -1;
    e.liftUntil = 0;
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
    const s = this.scale;
    const cell = this.layout.cell;
    const cubeSize = Math.max(4, Math.round(cell * 0.82));
    const lift = FAMILIAR_H * s * 0.78 + cubeSize * 0.1;
    const quiet = this.quietFrames > 0;
    for (const v of this.model.familiars.values()) {
      let e = this.entries.get(v.id);
      if (!e) {
        e = this.acquire();
        this.entries.set(v.id, e);
        if (!this.reduced && !quiet && v.mode !== "retiring") this.popIn(e, s);
      }
      const frame = this.frameNames[v.colorIndex]![FRAME_INDEX[frameFor(v, tick)]]!;
      if (e.img.frame.name !== frame) e.img.setFrame(frame);

      // Position: interpolate along this tick's move, otherwise stand on the cell.
      let x = this.cx(v.to);
      let y = this.cy(v.to);
      if (v.mode === "walk" || v.mode === "carry") {
        const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
        x = this.cx(v.from) + (x - this.cx(v.from)) * t;
        y = this.cy(v.from) + (y - this.cy(v.from)) * t;
      }
      // A gentle hover while moving or waiting; none for reduced motion.
      const hover =
        this.reduced || v.mode === "pickup" || v.mode === "deliver"
          ? 0
          : Math.sin(timeMs / 110 + v.id * 1.7) * s * 0.7;
      e.img.setPosition(x, y + hover);
      if (!e.retiring && !e.popping) e.img.setScale(s);
      e.shadow.setPosition(x, y + s * 2.2);
      if (!e.retiring && !e.popping) e.shadow.setSize(s * 9, s * 3);

      // The carried cube rides above the head from the grab until the drop, rising from its cell.
      if (v.carried !== null && v.mode !== "retiring") {
        if (e.cubeColor !== v.carried) {
          e.cubeColor = v.carried;
          e.cube.clear();
          paintCube(e.cube, -cubeSize / 2, -cubeSize / 2, cubeSize, this.tones[v.carried]!);
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
      if (e.chest) this.placeChest(e, v, frameFor(v, tick), x, y + hover);
      if (v.mode === "retiring" && !e.retiring) this.retire(v.id, e);
    }
    // Sprites whose familiar vanished from the model (restart/undo) are released.
    for (const [id, e] of this.entries) {
      if (!this.model.familiars.has(id)) {
        this.release(e);
        this.entries.delete(id);
      }
    }
    if (this.quietFrames > 0) this.quietFrames--;
  }

  /** Colour-blind symbol on the chest, at the frame's badge anchor, following the sprite's current scale. */
  private placeChest(e: Entry, v: FamiliarVisual, frame: FrameName, x: number, y: number): void {
    if (!this.symbolPalette || !e.chest) return;
    const r = badgeRect(frame);
    const s = e.img.scaleX; // not the target scale: the sprite may be mid pop-in
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

  private popIn(e: Entry, s: number): void {
    e.popping = true;
    e.img.setScale(s * 0.2);
    e.shadow.setSize(s * 2, s * 1);
    this.scene.tweens.add({
      targets: e.img,
      scale: s,
      duration: 140,
      ease: "Back.easeOut",
      onComplete: () => {
        e.popping = false;
      },
    });
    this.scene.tweens.add({
      targets: e.shadow,
      width: s * 9,
      height: s * 3,
      duration: 140,
      ease: "Sine.easeOut",
    });
  }

  private retire(id: number, e: Entry): void {
    e.retiring = true;
    if (this.reduced) {
      this.finishRetire(id);
      return;
    }
    this.scene.tweens.add({
      targets: e.img,
      x: this.cx(this.model.portal),
      y: this.cy(this.model.portal),
      scale: this.scale * 0.15,
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

  /** The cube arcs from above the portal into it, with a small burst where it lands. */
  private flyCubeIntoPortal(colorIndex: number, group: number): void {
    const tone = this.tones[colorIndex];
    if (!tone || this.reduced) {
      this.onDelivered(colorIndex, group);
      return;
    }
    const px = this.cx(this.model.portal);
    const py = this.cy(this.model.portal);
    const size = Math.max(4, Math.round(this.layout.cell * 0.82));
    const g = this.scene.add
      .graphics()
      .setDepth(D.effect)
      .setPosition(px, py - FAMILIAR_H * this.scale * 0.78);
    paintCube(g, -size / 2, -size / 2, size, tone);
    this.scene.tweens.add({
      targets: g,
      y: py,
      scale: 0.25,
      alpha: 0.2,
      duration: 150,
      ease: "Cubic.easeIn",
      onComplete: () => {
        g.destroy();
        this.burst(px, py, tone.light);
        this.onDelivered(colorIndex, group);
      },
    });
  }

  /** A few sparks drifting up out of the portal. */
  private burst(x: number, y: number, color: number): void {
    const r = Math.max(1, Math.round(this.layout.cell * 0.12));
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + ((i - 2.5) / 6) * Math.PI;
      const dot = this.scene.add.circle(x, y, r, color, 0.9).setDepth(D.effect);
      this.scene.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * this.layout.cell * 1.1,
        y: y + Math.sin(a) * this.layout.cell * 1.1,
        alpha: 0,
        duration: 280,
        ease: "Sine.easeOut",
        onComplete: () => dot.destroy(),
      });
    }
  }
}
