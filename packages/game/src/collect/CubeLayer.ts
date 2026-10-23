import type Phaser from "phaser";
import type { CollectLayout } from "./collectLayout";
import { paintCube, paintSeal, tonesFor, type CubeTones } from "./cubePaint";

/**
 * Draws every cube on the board. The cubes are painted once into a RenderTexture (one textured quad
 * per frame, however many cubes there are) and a pickup just clears that cube's cell; the queued
 * edits are flushed once per frame. (A Graphics object would re-run every cube's draw commands on
 * every frame: with 1,600 cubes that was the main source of dropped frames.) Reserved cubes get a
 * thin ring in a second, tiny Graphics that changes far more often. Wax seals (M13.4) are a second
 * RenderTexture painted over the cubes, redrawn only when a seal lifts.
 */
export class CubeLayer {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly sealRt: Phaser.GameObjects.RenderTexture;
  private sealed = new Map<number, number>();
  private readonly ringG: Phaser.GameObjects.Graphics;
  private readonly size: number;
  private readonly gap: number;
  private readonly tones: CubeTones[];
  private editsPending = false;
  private ringsDirty = true;
  private marks = new Map<number, number>();
  /** Counters for the profiler: full paints, single-cube clears flushed, ring redraws. */
  readonly stats = { fullPaints: 0, clears: 0, flushes: 0, ringRedraws: 0, paintMs: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: CollectLayout,
    palette: readonly string[],
    private readonly grid: number[],
    /** Per padded cell tones for shaded art (ART_DIRECTION_V2 §1); absent = family colours. */
    private readonly lookTones: readonly (CubeTones | undefined)[] | null = null,
  ) {
    this.tones = palette.map((hex) => tonesFor(hex));
    const { cell, boardRect, stride } = layout;
    this.gap = Math.max(1, Math.floor(cell / 12));
    this.size = cell - this.gap;
    // The texture covers the mosaic only (the ring is never filled with cubes).
    const mosaicW = (stride - 2) * cell;
    const mosaicH = boardRect.h - 2 * cell;
    this.rt = scene.add
      .renderTexture(boardRect.x + cell, boardRect.y + cell, mosaicW, mosaicH)
      .setOrigin(0, 0)
      .setDepth(1);
    this.sealRt = scene.add
      .renderTexture(boardRect.x + cell, boardRect.y + cell, mosaicW, mosaicH)
      .setOrigin(0, 0)
      .setDepth(1.05);
    this.ringG = scene.add.graphics().setDepth(1.1);
    this.paintAll(scene);
  }

  private paintAll(scene: Phaser.Scene): void {
    const started = performance.now();
    const { cell, stride } = this.layout;
    const g = scene.make.graphics({}, false);
    for (let i = 0; i < this.grid.length; i++) {
      const color = this.grid[i]!;
      if (color < 0) continue;
      // Mosaic-local pixel position (the ring cell at index 0 of each padded row/column is skipped).
      const x = ((i % stride) - 1) * cell + Math.floor(this.gap / 2);
      const y = (Math.floor(i / stride) - 1) * cell + Math.floor(this.gap / 2);
      paintCube(g, x, y, this.size, this.lookTones?.[i] ?? this.tones[color]!);
    }
    this.rt.draw(g, 0, 0);
    this.rt.render();
    g.destroy();
    this.stats.fullPaints++;
    this.stats.paintMs += performance.now() - started;
  }

  /**
   * The cubes that are sealed now (padded cell → key palette index). Repaints only when the set
   * changes, which is when a key colour's last group completes.
   */
  setSeals(seals: ReadonlyMap<number, number>): void {
    if (seals.size === this.sealed.size && [...seals].every(([k, v]) => this.sealed.get(k) === v))
      return;
    this.sealed = new Map(seals);
    this.sealRt.clear();
    if (seals.size > 0) {
      const { cell, stride } = this.layout;
      const g = this.scene.make.graphics({}, false);
      for (const [i, key] of seals) {
        const x = ((i % stride) - 1) * cell + Math.floor(this.gap / 2);
        const y = (Math.floor(i / stride) - 1) * cell + Math.floor(this.gap / 2);
        paintSeal(g, x, y, this.size, this.tones[key]!);
      }
      this.sealRt.draw(g, 0, 0);
      // The draw runs at render time: render before the Graphics goes (as paintAll does).
      this.sealRt.render();
      g.destroy();
    } else {
      this.sealRt.render();
    }
  }

  /** A cube left the board (picked up): clear its cell in the texture (flushed next frame). */
  remove(cell: number): void {
    if (this.grid[cell] === -1) return;
    this.grid[cell] = -1;
    const { cell: c, stride } = this.layout;
    this.rt.clear(((cell % stride) - 1) * c, (Math.floor(cell / stride) - 1) * c, c, c);
    this.editsPending = true;
    this.stats.clears++;
    if (this.marks.delete(cell)) this.ringsDirty = true;
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

  /** Applies the queued edits and redraws the rings if they changed. Call once per frame. */
  flush(): void {
    if (this.editsPending) {
      this.editsPending = false;
      this.rt.render();
      this.stats.flushes++;
    }
    if (this.ringsDirty) {
      this.ringsDirty = false;
      this.stats.ringRedraws++;
      const { cell, boardRect, stride } = this.layout;
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
