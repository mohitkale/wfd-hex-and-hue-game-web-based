/**
 * Geometry of the home screen's level map (M15.13, owner request: a scrollable map like games show,
 * not a squeezed list). The map is a tall world, level 1 at the bottom, every stop a fixed distance
 * above the one before on a winding path, so it grows with the levels and the player drags it to see
 * what comes next. Pure, so it is tested without Phaser. Lengths are in device px.
 */

/** Distance between two stops, in css px. */
export const STOP_GAP_CSS = 112;
/** Room above the last stop (for the "more to come" sign) and below the first, in css px. */
export const MAP_PAD_TOP_CSS = 150;
export const MAP_PAD_BOTTOM_CSS = 96;
/** How quickly a flicked map slows down: its speed falls to a third in about this many ms. */
export const SCROLL_DECAY_MS = 320;
/** A press that moves less than this (css px) is a tap, not a drag. */
export const TAP_SLOP_CSS = 10;

export interface Point {
  x: number;
  y: number;
}

export interface MapGeometry {
  width: number;
  height: number;
  /** Where each stop is, level 1 first. */
  stops: Point[];
  /** How far the path swings left and right of the middle. */
  amp: number;
  /** The path at `t` (0 is the first stop, 1 the second, and so on; fractions lie between). */
  pathAt(t: number): Point;
}

/** The map for `count` levels on a screen `width` px wide. */
export function mapGeometry(count: number, width: number, dpr: number): MapGeometry {
  const gap = STOP_GAP_CSS * dpr;
  const bottom = MAP_PAD_BOTTOM_CSS * dpr;
  const height = MAP_PAD_TOP_CSS * dpr + bottom + Math.max(0, count - 1) * gap;
  const amp = Math.min(110 * dpr, width * 0.26);
  const pathAt = (t: number): Point => ({
    x: width / 2 + amp * Math.sin(t * 1.05 + 0.4),
    y: height - bottom - t * gap,
  });
  return {
    width,
    height,
    amp,
    stops: Array.from({ length: count }, (_, i) => pathAt(i)),
    pathAt,
  };
}

/** Keeps a scroll position (the world y at the top of the view) inside the map. */
export const clampScroll = (y: number, worldH: number, viewH: number): number =>
  Math.max(0, Math.min(Math.max(0, worldH - viewH), y));

/** The scroll that shows stop `index` a little below the middle of the view (the way on is above it). */
export const scrollToStop = (geo: MapGeometry, index: number, viewH: number): number =>
  clampScroll((geo.stops[index]?.y ?? geo.height) - viewH * 0.6, geo.height, viewH);

/** A flick's speed after `dtMs` more ms. */
export const decay = (speed: number, dtMs: number): number =>
  speed * Math.exp(-Math.max(0, dtMs) / SCROLL_DECAY_MS);

/** The stop under a tap at world point `p`, within `reach` px of its centre, or -1. */
export function stopAt(geo: MapGeometry, p: Point, reach: number): number {
  let best = -1;
  let bestD = reach;
  geo.stops.forEach((s, i) => {
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
