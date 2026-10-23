import type { CollectLayout } from "./collectLayout";

/**
 * The progress bar (M14.1): how much of the picture is delivered. It answers "how far am I" without a
 * single extra word on the play screen. Pure, so the numbers and the geometry are tested.
 */

export interface Progress {
  delivered: number;
  total: number;
  /** 0..1; 0 for a level with no cubes. */
  fraction: number;
  /** Whole percent, never 100 until every cube is delivered. */
  percent: number;
}

export function progressOf(s: { deliveredTotal: number; cubesTotal: number }): Progress {
  const total = Math.max(0, s.cubesTotal);
  const delivered = Math.max(0, Math.min(total, s.deliveredTotal));
  const fraction = total === 0 ? 0 : delivered / total;
  // Floor, so "99%" never rounds up to "100%" while a cube is still out.
  return { delivered, total, fraction, percent: Math.floor(fraction * 100) };
}

export interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The bar's track: along the bottom edge of the HUD, inside the same side padding as the title. */
export function progressTrack(layout: CollectLayout): BarRect {
  const { hud, frame, dpr } = layout;
  const h = Math.max(2, Math.round(3.5 * dpr));
  const pad = Math.round(14 * dpr);
  return { x: frame.x + pad, y: hud.y + hud.h - h - Math.round(2 * dpr), w: frame.w - 2 * pad, h };
}

/** The filled part of the track for a fraction (at least a sliver once anything is delivered). */
export function progressFill(track: BarRect, fraction: number): BarRect {
  const f = Math.max(0, Math.min(1, fraction));
  const w = f === 0 ? 0 : Math.max(track.h, Math.round(track.w * f));
  return { x: track.x, y: track.y, w: Math.min(track.w, w), h: track.h };
}
