import { EMPTY } from "../level";

/**
 * Padded-grid helpers (docs/V2_PROTOTYPE_SPEC.md §2). The grid is the mosaic plus a one-cell ring;
 * its stride is `width + 2` and the index of mosaic cell `(x, y)` is `(y + 1) * stride + (x + 1)`.
 * Indices grow with `y` and then `x`, so "smaller y, then smaller x" is "smaller index".
 */

/** Neighbour order used everywhere a tie needs breaking: up, left, right, down. */
export const NEIGHBOR_ORDER = ["up", "left", "right", "down"] as const;

export interface Topology {
  stride: number;
  /** Number of padded rows. */
  rows: number;
  /** `neighbors[4 * cell + k]` is the k-th neighbour (NEIGHBOR_ORDER) or -1 off the grid. */
  neighbors: Int32Array;
}

const topologyCache = new Map<string, Topology>();

/** Shared, read-only topology for a mosaic size. */
export function topologyFor(width: number, height: number): Topology {
  const key = `${width}x${height}`;
  let t = topologyCache.get(key);
  if (t) return t;
  const stride = width + 2;
  const rows = height + 2;
  const neighbors = new Int32Array(stride * rows * 4).fill(-1);
  for (let py = 0; py < rows; py++) {
    for (let px = 0; px < stride; px++) {
      const cell = py * stride + px;
      if (py > 0) neighbors[cell * 4] = cell - stride;
      if (px > 0) neighbors[cell * 4 + 1] = cell - 1;
      if (px < stride - 1) neighbors[cell * 4 + 2] = cell + 1;
      if (py < rows - 1) neighbors[cell * 4 + 3] = cell + stride;
    }
  }
  t = { stride, rows, neighbors };
  topologyCache.set(key, t);
  return t;
}

export const paddedIndex = (stride: number, x: number, y: number): number =>
  (y + 1) * stride + (x + 1);

/** Pads `cells` (unpadded, row-major) with an empty ring. */
export function padCells(width: number, height: number, cells: readonly number[]): number[] {
  const stride = width + 2;
  const grid = new Array<number>(stride * (height + 2)).fill(EMPTY);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) grid[paddedIndex(stride, x, y)] = cells[y * width + x]!;
  }
  return grid;
}

/**
 * Canonical distance map: shortest 4-neighbour walking distance from `portal` through open cells
 * (`grid[c] === EMPTY`), -1 for cells not reachable (cubes and sealed pockets).
 */
export function computeDist(t: Topology, grid: readonly number[], portal: number): number[] {
  const dist = new Array<number>(grid.length).fill(-1);
  dist[portal] = 0;
  const queue = [portal];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!;
    const d = dist[c]! + 1;
    for (let k = 0; k < 4; k++) {
      const n = t.neighbors[c * 4 + k]!;
      if (n >= 0 && grid[n] === EMPTY && dist[n] === -1) {
        dist[n] = d;
        queue.push(n);
      }
    }
  }
  return dist;
}

/**
 * Updates `dist` after `cell` became open (its cube was removed). Distances only decrease or go
 * from -1 to finite, so a queue seeded at the new cell is enough; the result equals a fresh
 * `computeDist`. Returns every cell whose distance went from -1 to finite, the new cell included.
 */
export function openCell(
  t: Topology,
  grid: readonly number[],
  dist: number[],
  cell: number,
): number[] {
  let best = -1;
  for (let k = 0; k < 4; k++) {
    const n = t.neighbors[cell * 4 + k]!;
    if (n >= 0 && dist[n]! >= 0 && (best === -1 || dist[n]! < best)) best = dist[n]!;
  }
  // Callers only open cells next to a familiar's standing cell, which is reachable.
  if (best === -1) throw new Error(`cell ${cell} opened without a reachable neighbour`);
  const newlyReachable: number[] = [];
  if (dist[cell] === -1) newlyReachable.push(cell);
  dist[cell] = best + 1;
  const queue = [cell];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!;
    const d = dist[c]! + 1;
    for (let k = 0; k < 4; k++) {
      const n = t.neighbors[c * 4 + k]!;
      if (n < 0 || grid[n] !== EMPTY) continue;
      if (dist[n] === -1) {
        newlyReachable.push(n);
        dist[n] = d;
        queue.push(n);
      } else if (dist[n]! > d) {
        dist[n] = d;
        queue.push(n);
      }
    }
  }
  return newlyReachable;
}

/**
 * Canonical descent (GAME_DESIGN_V2 §4): from `standing`, repeatedly step to the first neighbour
 * (up, left, right, down) whose distance is one smaller. Returns the route from the portal to
 * `standing`, inclusive.
 */
export function routeTo(t: Topology, dist: readonly number[], standing: number): number[] {
  const route = [standing];
  let cur = standing;
  while (dist[cur]! > 0) {
    const want = dist[cur]! - 1;
    let next = -1;
    for (let k = 0; k < 4; k++) {
      const n = t.neighbors[cur * 4 + k]!;
      if (n >= 0 && dist[n] === want) {
        next = n;
        break;
      }
    }
    if (next === -1) throw new Error(`no route from cell ${standing}: broken distance map`);
    route.push(next);
    cur = next;
  }
  return route.reverse();
}
