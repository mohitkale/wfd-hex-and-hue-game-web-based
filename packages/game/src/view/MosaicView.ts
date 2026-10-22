import Phaser from "phaser";
import { EMPTY, type Level } from "@hexhue/core";
import { paintSymbol } from "../a11y";
import type { Layout } from "../layout";
import { inkFor } from "../theme";

let nextKey = 0;

/** `roundRect` needs Chrome 99 / Safari 16; older Android WebViews fall back to square tiles. */
function tile(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, r: number): void {
  ctx.beginPath();
  if (r > 0 && typeof ctx.roundRect === "function") ctx.roundRect(x, y, size, size, r);
  else ctx.rect(x, y, size, size);
  ctx.fill();
}

/**
 * The pixel mosaic as one canvas texture drawn at exact device-pixel cell size, so it stays crisp
 * and costs a single draw call. Collected cells are cleared in place.
 */
export class MosaicView {
  readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly key = `mosaic-${nextKey++}`;
  private dirty = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: Layout,
    private readonly level: Level,
    cells: readonly number[],
    /** Colorblind mode: each fragment shows its color's symbol. */
    private readonly symbols = false,
  ) {
    const { cell } = layout;
    this.texture = scene.textures.createCanvas(this.key, level.width * cell, level.height * cell)!;
    this.ctx = this.texture.getContext();
    for (let i = 0; i < cells.length; i++) this.paint(i, cells[i]!);
    this.texture.refresh();
    this.image = scene.add.image(layout.originX, layout.originY, this.key).setOrigin(0, 0);
  }

  /** Removes a collected fragment (leaves the faint empty-cell mark). Takes effect on `flush`. */
  clearCell(index: number): void {
    this.paint(index, EMPTY);
    this.dirty = true;
  }

  /** Paints a cell of the finished artwork (the win reveal: no symbols). Takes effect on `flush`. */
  paintCell(index: number, color: number): void {
    this.paint(index, color, false);
    this.dirty = true;
  }

  /** Uploads pending changes once; call after a batch of `clearCell`s (e.g. per frame). */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.texture.refresh();
  }

  /** Screen-space center of a mosaic cell. */
  cellCenter(index: number): { x: number; y: number } {
    const { cell, originX, originY } = this.layout;
    const x = index % this.level.width;
    const y = Math.floor(index / this.level.width);
    return { x: originX + (x + 0.5) * cell, y: originY + (y + 0.5) * cell };
  }

  destroy(): void {
    this.image.destroy();
    this.scene.textures.remove(this.key);
  }

  private paint(index: number, color: number, symbols = this.symbols): void {
    const { cell } = this.layout;
    const ctx = this.ctx;
    const x = (index % this.level.width) * cell;
    const y = Math.floor(index / this.level.width) * cell;
    const inset = Math.max(1, Math.round(cell * 0.06));
    const size = cell - inset * 2;
    const radius = cell >= 10 ? Math.round(cell * 0.18) : 0;
    ctx.clearRect(x, y, cell, cell);
    if (color === EMPTY) {
      // A faint dot keeps the board's shape readable without looking like a fragment.
      ctx.fillStyle = "rgba(201,184,255,0.12)";
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, Math.max(0.5, cell * 0.07), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = this.level.palette[color]!;
    tile(ctx, x + inset, y + inset, size, radius);
    if (cell >= 6) {
      // Soft bevel so neighbouring tiles of one color still read as individual fragments.
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(x + inset + radius / 2, y + inset, size - radius, Math.max(1, size * 0.16));
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(
        x + inset + radius / 2,
        y + inset + size - Math.max(1, size * 0.14),
        size - radius,
        Math.max(1, size * 0.14),
      );
    }
    // Symbols only where they stay legible (tiles of at least 9 CSS px).
    if (symbols && cell >= 9 * this.layout.dpr) {
      // Whichever ink contrasts more with the tile (see theme.inkFor).
      ctx.fillStyle = inkFor(this.level.palette[color]!);
      paintSymbol(ctx, color, x + cell / 2, y + cell / 2, cell * 0.52);
    }
  }
}
