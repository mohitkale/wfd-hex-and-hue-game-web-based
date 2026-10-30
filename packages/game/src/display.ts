/** Above this many backing pixels, the canvas renders below device resolution. */
export const MAX_CANVAS_PIXELS = 4_200_000;

/** How sharp the canvas may get: the highest pixel ratio and the most backing pixels. */
export interface PixelBudget {
  maxDpr: number;
  maxPixels: number;
}

export const V1_BUDGET: PixelBudget = { maxDpr: 3, maxPixels: MAX_CANVAS_PIXELS };

/**
 * The v2 board's budget (M15.13): it is fill-rate bound on integrated GPUs (measured on an Intel UHD
 * 630: a full-screen layer at 2× halved the frame rate), and its art is baked textures that stay crisp
 * at 2×, so it never renders above 2× or about 1.5 MP (a phone at 2× is 1.2 MP; a big desktop
 * window drops a little below 2×, as the game only uses a 480 px column of it).
 */
/**
 * Frames a second the v2 board is drawn at, at most. It was 14 to be lighter on laptops, which the owner
 * then found choppy next to the reference game (M15.13); 60 was tried, and the owner chose 30, since
 * busy boards had struggled to hold 60 on integrated GPUs. Only drawing depends on it: the tick clock,
 * the walk cycle (by distance walked) and the dive into the hole are timed in ms, so they play at the
 * same speed at any frame rate. A still board costs nothing either way: `IdleLoop` stops drawing.
 */
export const V2_FPS = 30;

export const V2_BUDGET: PixelBudget = { maxDpr: 2, maxPixels: 1_500_000 };

/**
 * The pixel ratio the canvas renders at: the device's (capped at 3×), lowered on big desktop
 * windows so the backing store stays under `MAX_CANVAS_PIXELS` (a 1920×1080 window at 2× would be
 * 8.3 MP of fill per frame for a 480 px wide game). Phones stay at full resolution: the largest
 * (430×932 at 3×) is 3.6 MP. Never below 1.
 */
export function renderDpr(
  deviceDpr: number,
  cssWidth: number,
  cssHeight: number,
  budget: PixelBudget = V1_BUDGET,
): number {
  const device = Math.min(Math.max(deviceDpr || 1, 1), budget.maxDpr);
  const area = Math.max(1, cssWidth * cssHeight);
  const capped = Math.sqrt(budget.maxPixels / area);
  // Rounded so tiny window-size changes don't flip the ratio back and forth.
  return Math.max(1, Math.min(device, Math.floor(capped * 4) / 4));
}

/**
 * The ratio to switch to after a resize, with hysteresis: near the pixel budget (±15%) the
 * current ratio stays, so dragging a window edge across a quarter-step boundary doesn't flip the
 * ratio (and rebuild the menus) back and forth. A device ratio that dropped below the current one
 * (window moved to a lower-density screen) always applies.
 */
export function nextRenderDpr(
  current: number,
  deviceDpr: number,
  cssWidth: number,
  cssHeight: number,
  budget: PixelBudget = V1_BUDGET,
): number {
  const target = renderDpr(deviceDpr, cssWidth, cssHeight, budget);
  if (target === current) return current;
  const device = Math.min(Math.max(deviceDpr || 1, 1), budget.maxDpr);
  if (current > device) return target;
  const pixels = (dpr: number) => cssWidth * dpr * cssHeight * dpr;
  if (target < current && pixels(current) <= budget.maxPixels * 1.15) return current;
  if (target > current && pixels(target) > budget.maxPixels * 0.85) return current;
  return target;
}
