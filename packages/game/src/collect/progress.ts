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
  const h = Math.max(2, Math.round(3 * dpr));
  const pad = Math.round(14 * dpr);
  // Flush with the HUD's bottom edge, so it stays below the 36 css px buttons even on a short screen.
  return { x: frame.x + pad, y: hud.y + hud.h - h, w: frame.w - 2 * pad, h };
}

/** The filled part of the track for a fraction (at least a sliver once anything is delivered). */
export function progressFill(track: BarRect, fraction: number): BarRect {
  const f = Math.max(0, Math.min(1, fraction));
  if (f === 0) return { x: track.x, y: track.y, w: 0, h: track.h };
  // Rounding must never fill the track while a cube is still out (a 1,600-cube board has 0.3 px per cube).
  const most = f >= 1 ? track.w : track.w - 1;
  const w = Math.min(most, Math.max(track.h, Math.round(track.w * f)));
  return { x: track.x, y: track.y, w, h: track.h };
}
