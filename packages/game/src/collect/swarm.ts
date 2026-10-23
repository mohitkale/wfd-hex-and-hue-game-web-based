/**
 * Cosmetic swarm behaviour: small, deterministic variations so many familiars on the same route look
 * alive instead of stacked. Everything here is a pure function of familiar ids and cells; it never
 * reads or changes game state, so logical outcomes are identical with or without it (and at 1× and 2×).
 */

/** A stable pseudo-random number in [0, 1) from an integer id and a salt (a small integer hash). */
export function unit(id: number, salt = 0): number {
  let h = Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(salt + 0x7f4a7c15, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export interface Offset {
  /** Fractions of a cell. */
  x: number;
  y: number;
}

/** How far a familiar may drift off the cell centre, in cells (about a third of a pixel-art "step"). */
export const MAX_DRIFT = 0.16;

/** This familiar's own steady lateral drift: it keeps the same small offset for its whole life. */
export function drift(id: number): Offset {
  return { x: (unit(id, 1) * 2 - 1) * MAX_DRIFT, y: (unit(id, 2) * 2 - 1) * MAX_DRIFT };
}

/** Hover phase (radians) and speed factor so wings and bobbing never beat in unison. */
export function hover(id: number): { phase: number; rate: number } {
  return { phase: unit(id, 3) * Math.PI * 2, rate: 0.85 + unit(id, 4) * 0.3 };
}

/** Pop-in length in ms: 120–170, so a batch of spawns does not all land on the same frame. */
export function popDuration(id: number): number {
  return Math.round(120 + unit(id, 5) * 50);
}

/** Linear interpolation with `t` clamped to 0..1 (progress through a tick). */
export function interpolate(from: number, to: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return from + (to - from) * k;
}

/**
 * Where a familiar is drawn along one axis, in pixels: the cell centre plus its own drift and its
 * share of a crowded cell (both in cells). Pure and scalar, so the layer calls it for x and y every
 * frame without allocating.
 */
export function drawnCoord(
  center: number,
  driftCells: number,
  spreadCells: number,
  cellPx: number,
): number {
  return center + (driftCells + spreadCells) * cellPx;
}

/** Moves `current` a fraction of the way to `target` (eases the crowd offset instead of snapping). */
export function ease(current: number, target: number, rate = 0.25): number {
  return current + (target - current) * rate;
}

/**
 * Spreads familiars that are drawn on the same cell so they overlap less: the k-th of n (in the order
 * they are added) gets a horizontal offset in [-spread, +spread] cells. It reduces exact stacking
 * but does not remove overlap: sprites are wider than a cell. Reuses its maps, so calling it every
 * frame allocates nothing new once warm.
 */
export class CellSpreader {
  private readonly total = new Map<number, number>();
  private readonly seen = new Map<number, number>();
  private readonly ids: number[] = [];
  private readonly cells: number[] = [];
  private readonly offsets = new Map<number, number>();

  constructor(private readonly spread = 0.28) {}

  /** Starts a frame. */
  begin(): void {
    this.total.clear();
    this.seen.clear();
    this.offsets.clear();
    this.ids.length = 0;
    this.cells.length = 0;
  }

  /** A familiar drawn on `cell` this frame. */
  add(id: number, cell: number): void {
    this.ids.push(id);
    this.cells.push(cell);
    this.total.set(cell, (this.total.get(cell) ?? 0) + 1);
  }

  /** Assigns the offsets for the frame. */
  finish(): void {
    for (let i = 0; i < this.ids.length; i++) {
      const cell = this.cells[i]!;
      const n = this.total.get(cell)!;
      const k = this.seen.get(cell) ?? 0;
      this.seen.set(cell, k + 1);
      this.offsets.set(this.ids[i]!, n === 1 ? 0 : (k / (n - 1) - 0.5) * 2 * this.spread);
    }
  }

  /** The extra horizontal offset (in cells) for familiar `id`, or 0. */
  offset(id: number): number {
    return this.offsets.get(id) ?? 0;
  }
}
