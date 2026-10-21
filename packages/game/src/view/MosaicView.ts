import Phaser from "phaser";
import { EMPTY, type Level } from "@hexhue/core";
import type { Layout } from "../layout";

let nextKey = 0;

/**
 * The pixel mosaic as one canvas texture drawn at exact device-pixel cell size, so it stays crisp
 * and costs a single draw call. Collected cells are cleared in place.
 */
export class MosaicView {
  readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly key = `mosaic-${nextKey++}`;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: Layout,
    private readonly level: Level,
    cells: readonly number[],
  ) {
    const { cell } = layout;
    this.texture = scene.textures.createCanvas(this.key, level.width * cell, level.height * cell)!;
    this.ctx = this.texture.getContext();
    for (let i = 0; i < cells.length; i++) this.paint(i, cells[i]!);
    this.texture.refresh();
    this.image = scene.add.image(layout.originX, layout.originY, this.key).setOrigin(0, 0);
  }

  /** Removes a collected fragment (leaves the faint empty-cell mark). */
  clearCell(index: number): void {
    this.paint(index, EMPTY);
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

  private paint(index: number, color: number): void {
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
    ctx.beginPath();
    ctx.roundRect(x + inset, y + inset, size, size, radius);
    ctx.fill();
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
  }
}
