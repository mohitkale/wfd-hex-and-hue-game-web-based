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
