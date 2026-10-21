import { EMPTY } from "./level";

export type Lane = "bottom" | "right" | "top" | "left" | "corner";

/**
 * What a wisp on a track cell can see: a straight line into the mosaic. `start` is the first cell
 * index looked at and `stride` the index delta to the next one; `length` cells are scanned.
 */
export interface Sight {
  start: number;
  stride: number;
  length: number;
}

export interface TrackCell {
  /** Grid coordinates; the track sits one cell outside the mosaic (x in -1..W, y in -1..H). */
  x: number;
  y: number;
  lane: Lane;
  /** Line of sight into the mosaic, or `null` on corners. */
  sight: Sight | null;
}

/**
 * Builds the track loop around a `width × height` mosaic, in travel order. Index 0 is the entry at
 * the bottom-left corner. Wisps travel right along the bottom, up the right side, left along the
 * top and down the left side (anticlockwise on screen, where y grows downward), always looking
 * inward. Length is `2 * (width + height) + 4`.
 */
export function buildTrack(width: number, height: number): TrackCell[] {
  const W = width;
  const H = height;
  const track: TrackCell[] = [];
  const corner = (x: number, y: number) => track.push({ x, y, lane: "corner", sight: null });

  corner(-1, H);
  for (let x = 0; x < W; x++) {
    // Bottom lane looks up column x, starting at the bottom row.
    track.push({
      x,
      y: H,
      lane: "bottom",
      sight: { start: (H - 1) * W + x, stride: -W, length: H },
    });
  }
  corner(W, H);
  for (let y = H - 1; y >= 0; y--) {
    // Right lane looks left along row y, starting at the rightmost column.
    track.push({ x: W, y, lane: "right", sight: { start: y * W + W - 1, stride: -1, length: W } });
  }
  corner(W, -1);
  for (let x = W - 1; x >= 0; x--) {
    // Top lane looks down column x, starting at the top row.
    track.push({ x, y: -1, lane: "top", sight: { start: x, stride: W, length: H } });
  }
  corner(-1, -1);
  for (let y = 0; y < H; y++) {
    // Left lane looks right along row y, starting at the leftmost column.
    track.push({ x: -1, y, lane: "left", sight: { start: y * W, stride: 1, length: W } });
  }
  return track;
}

/** Index of the first non-empty cell along `sight`, or -1 if the line is clear. */
export function firstInSight(cells: readonly number[], sight: Sight): number {
  let i = sight.start;
  for (let n = 0; n < sight.length; n++, i += sight.stride) {
    if (cells[i] !== EMPTY) return i;
  }
  return -1;
}
