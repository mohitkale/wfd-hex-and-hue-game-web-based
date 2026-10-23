import type * as collect from "@hexhue/core/collect";
import Phaser from "phaser";
import { cellCenter, spriteScaleForCell, type CollectLayout } from "./collectLayout";
import { paintCube, type CubeTones } from "./cubePaint";
import { FAMILIAR_H, FAMILIAR_W, badgeRect } from "./familiarArt";
import { hexToNumber, inkFor } from "../theme";
import { symbolTexture } from "../view/textures";
import { frameFor, lerpPoint, type FamiliarVisual, type VisualModel } from "./visuals";

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
  spawnedAt: number;
}

const D = { shadow: 4, sprite: 5, cube: 6, effect: 8 } as const;

/**
 * Draws the familiars from the visual model: pooled sprites (no allocation per frame), a carried
 * cube above the head, a soft shadow, and the effects for spawning, delivering and retiring. It
 * reads state from the model and never touches game state.
 */
export class FamiliarLayer {
  private readonly entries = new Map<number, Entry>();
  private readonly pool: Entry[] = [];
  /** Called when a cube lands in the portal: (palette index, group id). */
  onDelivered: (colorIndex: number, group: number) => void = () => undefined;

  constructor(
    private readonly scene: Phaser.Scene,
    private layout: CollectLayout,
    private readonly atlas: string,
    private readonly model: VisualModel,
    private readonly tones: readonly CubeTones[],
    private readonly reduced: boolean,
    /** Palette hex colours when colour-blind symbols are on, otherwise null. */
    private readonly symbolPalette: readonly string[] | null = null,
  ) {}

  setLayout(layout: CollectLayout): void {
    this.layout = layout;
  }

  /** Removes every sprite (after a resize, undo or restart). */
  clear(): void {
    for (const e of this.entries.values()) this.release(e);
    this.entries.clear();
  }

  private get scale(): number {
    return spriteScaleForCell(this.layout.cell);
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
    return { img, shadow, cube, chest, mark, cubeColor: -1, retiring: false, spawnedAt: -1 };
  }

  private release(e: Entry): void {
    this.scene.tweens.killTweensOf([e.img, e.shadow, e.cube]);
    e.img.setVisible(false).setScale(1).setAlpha(1);
    e.shadow.setVisible(false).setAlpha(0.32);
    e.cube.setVisible(false).setAlpha(1);
    e.chest?.setVisible(false);
    e.mark?.setVisible(false);
    e.retiring = false;
    e.cubeColor = -1;
    this.pool.push(e);
  }

  /** Effects driven by events (the model already holds the state). */
  handle(e: CollectEvent): void {
    if (e.type === "cubeDelivered") this.flyCubeIntoPortal(e.familiar, e.color, e.group);
  }

  private spritePos(v: FamiliarVisual, alpha: number): { x: number; y: number } {
    const to = cellCenter(this.layout, v.to);
    if (v.mode === "walk" || v.mode === "carry") {
      return lerpPoint(cellCenter(this.layout, v.from), to, alpha);
    }
    return to;
  }

  /** Per-frame update: place, pose and tint every sprite. `tick` is the engine tick, `timeMs` wall time. */
  update(tick: number, alpha: number, timeMs: number): void {
    const s = this.scale;
    const cell = this.layout.cell;
    for (const v of this.model.familiars.values()) {
      let e = this.entries.get(v.id);
      if (!e) {
        e = this.acquire();
        this.entries.set(v.id, e);
        e.spawnedAt = timeMs;
        if (!this.reduced && v.mode !== "retiring") this.popIn(e, s);
      }
      const frame = `${v.colorIndex}:${frameFor(v, tick)}`;
      if (e.img.frame.name !== frame) e.img.setFrame(frame);
      const p = this.spritePos(v, alpha);
      // A gentle hover while moving or waiting; none for reduced motion.
      const hover =
        this.reduced || v.mode === "pickup" || v.mode === "deliver"
          ? 0
          : Math.sin(timeMs / 110 + v.id * 1.7) * s * 0.7;
      e.img.setPosition(p.x, p.y + hover);
      if (!e.retiring && !this.scene.tweens.isTweening(e.img)) e.img.setScale(s);
      e.shadow.setPosition(p.x, p.y + s * 2.2);
      if (!e.retiring && !this.scene.tweens.isTweening(e.shadow)) e.shadow.setSize(s * 9, s * 3);

      this.placeSymbols(e, v, frameFor(v, tick), p, s, hover);

      // The carried cube rides above the head from the grab until the drop.
      if (v.carried !== null && v.mode !== "retiring") {
        const size = Math.max(4, Math.round(cell * 0.82));
        if (e.cubeColor !== v.carried) {
          e.cubeColor = v.carried;
          e.cube.clear();
          paintCube(e.cube, -size / 2, -size / 2, size, this.tones[v.carried]!);
        }
        const lift = FAMILIAR_H * s * 0.78 + size * 0.1;
        e.cube
          .setPosition(p.x, p.y - lift + hover)
          .setVisible(true)
          .setScale(v.mode === "pickup" ? 1.15 : 1);
      } else {
        e.cube.setVisible(false);
        e.cubeColor = -1;
      }

      if (v.mode === "retiring" && !e.retiring) this.retire(v.id, e);
    }
    // Sprites whose familiar vanished from the model (restart/undo) are released.
    for (const [id, e] of this.entries) {
      if (!this.model.familiars.has(id)) {
        this.release(e);
        this.entries.delete(id);
      }
    }
  }

  /** Colour-blind symbols: on the chest (the badge anchor of the frame) and on the carried cube. */
  private placeSymbols(
    e: Entry,
    v: FamiliarVisual,
    frame: ReturnType<typeof frameFor>,
    p: { x: number; y: number },
    s: number,
    hover: number,
  ): void {
    if (!this.symbolPalette || !e.chest) return;
    const hex = this.symbolPalette[v.colorIndex]!;
    const tint = hexToNumber(inkFor(hex));
    const r = badgeRect(frame);
    const key = symbolTexture(this.scene, v.colorIndex);
    // Sprite pixel (x, y) sits at origin (0.5, 0.78) of the 16×14 frame.
    const cx = p.x + (r.x + r.w / 2 - FAMILIAR_W / 2) * s;
    const cy = p.y + hover + (r.y + r.h / 2 - FAMILIAR_H * 0.78) * s;
    e.chest
      .setTexture(key)
      .setTint(tint)
      .setPosition(cx, cy)
      .setDisplaySize(Math.min(r.w, r.h) * s * 0.95, Math.min(r.w, r.h) * s * 0.95)
      .setVisible(!e.retiring);
    if (e.mark) {
      const size = Math.max(4, Math.round(this.layout.cell * 0.82));
      const lift = FAMILIAR_H * s * 0.78 + size * 0.1;
      e.mark
        .setTexture(key)
        .setTint(tint)
        .setPosition(p.x, p.y - lift + hover)
        .setDisplaySize(size * 0.62, size * 0.62)
        .setVisible(v.carried !== null && !e.retiring);
    }
  }

  private popIn(e: Entry, s: number): void {
    e.img.setScale(s * 0.2);
    e.shadow.setSize(s * 2, s * 1);
    this.scene.tweens.add({ targets: e.img, scale: s, duration: 140, ease: "Back.easeOut" });
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
    const portal = cellCenter(this.layout, this.model.portal);
    this.scene.tweens.add({
      targets: e.img,
      x: portal.x,
      y: portal.y,
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

  /** The cube arcs from above the familiar into the portal, with a small burst where it lands. */
  private flyCubeIntoPortal(familiar: number, colorIndex: number, group: number): void {
    const v = this.model.familiars.get(familiar);
    const portal = cellCenter(this.layout, this.model.portal);
    const tone = this.tones[colorIndex];
    if (!v || !tone) {
      this.onDelivered(colorIndex, group);
      return;
    }
    if (this.reduced) {
      this.onDelivered(colorIndex, group);
      return;
    }
    const size = Math.max(4, Math.round(this.layout.cell * 0.82));
    const startY = portal.y - FAMILIAR_H * this.scale * 0.78;
    const g = this.scene.add.graphics().setDepth(D.effect).setPosition(portal.x, startY);
    paintCube(g, -size / 2, -size / 2, size, tone);
    this.scene.tweens.add({
      targets: g,
      y: portal.y,
      scale: 0.25,
      alpha: 0.2,
      duration: 150,
      ease: "Cubic.easeIn",
      onComplete: () => {
        g.destroy();
        this.burst(portal.x, portal.y, tone.light);
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

export const SPRITE_SIZE = { w: FAMILIAR_W, h: FAMILIAR_H } as const;
