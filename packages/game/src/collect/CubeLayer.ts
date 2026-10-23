import type Phaser from "phaser";
import type { CollectLayout } from "./collectLayout";
import { paintCube, tonesFor, type CubeTones } from "./cubePaint";

/**
 * Draws every cube on the board into one Graphics object (a single batched draw) and redraws it,
 * at most once per frame, only when a cube is removed. Reserved cubes get a thin ring (a second,
 * tiny Graphics that changes far more often) so you can see which cube each familiar is heading for.
 */
export class CubeLayer {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly ringG: Phaser.GameObjects.Graphics;
  private readonly tones: CubeTones[];
  private cubesDirty = true;
  private ringsDirty = true;
  private marks = new Map<number, number>();

  constructor(
    scene: Phaser.Scene,
    private readonly layout: CollectLayout,
    palette: readonly string[],
    private readonly grid: number[],
  ) {
    this.g = scene.add.graphics().setDepth(1);
    this.ringG = scene.add.graphics().setDepth(1.1);
    this.tones = palette.map(tonesFor);
  }

  /** A cube left the board (picked up). */
  remove(cell: number): void {
    if (this.grid[cell] !== -1) {
      this.grid[cell] = -1;
      this.cubesDirty = true;
      if (this.marks.delete(cell)) this.ringsDirty = true;
    }
  }

  /** Cells currently being fetched, with the palette index of their colour. Redraws only on change. */
  setMarks(marks: ReadonlyMap<number, number>): void {
    if (marks.size === this.marks.size) {
      let same = true;
      for (const [k, v] of marks) {
        if (this.marks.get(k) !== v) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    this.marks = new Map(marks);
    this.ringsDirty = true;
  }

  /** Redraws what changed. Call once per frame. */
  flush(): void {
    const { cell, boardRect, stride } = this.layout;
    if (this.cubesDirty) {
      this.cubesDirty = false;
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
    }
    if (this.ringsDirty) {
      this.ringsDirty = false;
      const g = this.ringG;
      g.clear();
      g.lineStyle(Math.max(1, Math.round(this.layout.dpr)), 0xffffff, 0.75);
      for (const cellIdx of this.marks.keys()) {
        if (this.grid[cellIdx]! < 0) continue;
        g.strokeRect(
          boardRect.x + (cellIdx % stride) * cell,
          boardRect.y + Math.floor(cellIdx / stride) * cell,
          cell,
          cell,
        );
      }
    }
  }
}
