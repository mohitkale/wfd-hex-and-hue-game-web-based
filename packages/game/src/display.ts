/** Above this many backing pixels, the canvas renders below device resolution. */
export const MAX_CANVAS_PIXELS = 4_200_000;

/**
 * The pixel ratio the canvas renders at: the device's (capped at 3×), lowered on big desktop
 * windows so the backing store stays under `MAX_CANVAS_PIXELS` (a 1920×1080 window at 2× would be
 * 8.3 MP of fill per frame for a 480 px wide game). Phones stay at full resolution: the largest
 * (430×932 at 3×) is 3.6 MP. Never below 1.
 */
export function renderDpr(deviceDpr: number, cssWidth: number, cssHeight: number): number {
  const device = Math.min(Math.max(deviceDpr || 1, 1), 3);
  const area = Math.max(1, cssWidth * cssHeight);
  const capped = Math.sqrt(MAX_CANVAS_PIXELS / area);
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
): number {
  const target = renderDpr(deviceDpr, cssWidth, cssHeight);
  if (target === current) return current;
  const device = Math.min(Math.max(deviceDpr || 1, 1), 3);
  if (current > device) return target;
  const pixels = (dpr: number) => cssWidth * dpr * cssHeight * dpr;
  if (target < current && pixels(current) <= MAX_CANVAS_PIXELS * 1.15) return current;
  if (target > current && pixels(target) > MAX_CANVAS_PIXELS * 0.85) return current;
  return target;
}
