/** The value along a slider track for pointer x: 0..1, clamped at both ends. */
export function sliderValue(x: number, trackX: number, trackW: number): number {
  return Math.min(1, Math.max(0, (x - trackX) / Math.max(1, trackW)));
}
