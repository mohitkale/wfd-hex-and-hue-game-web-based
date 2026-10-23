import type Phaser from "phaser";
import type { CollectLayout } from "./collectLayout";
import { paintCube, tonesFor, type CubeTones } from "./cubePaint";

/**
 * Draws every cube on the board into one Graphics object (a single batched draw) and redraws it,
 * at most once per frame, when a cube is removed. Reserved cubes get a thin ring so you can see
 * which cube each familiar is heading for.
 */
export class CubeLayer {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly tones: CubeTones[];
  private dirty = true;
  private marks = new Map<number, number>();

  constructor(
    scene: Phaser.Scene,
    private layout: CollectLayout,
    palette: readonly string[],
    private grid: number[],
    depth = 1,
  ) {
    this.g = scene.add.graphics().setDepth(depth);
    this.tones = palette.map(tonesFor);
  }

  /** A cube left the board (picked up). */
  remove(cell: number): void {
    if (this.grid[cell] !== -1) {
      this.grid[cell] = -1;
      this.dirty = true;
    }
  }

  /** Replaces the whole board (after a resize, undo or restart). */
  reset(layout: CollectLayout, grid: number[]): void {
    this.layout = layout;
    this.grid = grid.slice();
    this.marks.clear();
    this.dirty = true;
  }

  /** Cells currently being fetched, with the palette index of their colour. */
  setMarks(marks: Map<number, number>): void {
    this.marks = marks;
    this.dirty = true;
  }

  /** Redraws if anything changed. Call once per frame. */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const { cell, boardRect, stride } = this.layout;
    const gap = Math.max(1, Math.floor(cell / 12));
    const size = cell - gap;
    const g = this.g;
    g.clear();
    for (let i = 0; i < this.grid.length; i++) {
      const color = this.grid[i]!;
      if (color < 0) continue;
      const x = boardRect.x + (i % stride) * cell + Math.floor(gap / 2);
      const y = boardRect.y + Math.floor(i / stride) * cell + Math.floor(gap / 2);
      paintCube(g, x, y, size, this.tones[color]!);
    }
    g.lineStyle(Math.max(1, Math.round(this.layout.dpr)), 0xffffff, 0.75);
    for (const cellIdx of this.marks.keys()) {
      if (this.grid[cellIdx]! < 0) continue;
      const x = boardRect.x + (cellIdx % stride) * cell;
      const y = boardRect.y + Math.floor(cellIdx / stride) * cell;
      g.strokeRect(x, y, cell, cell);
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
