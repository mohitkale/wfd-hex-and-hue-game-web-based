/** The value along a slider track for pointer x: 0..1, clamped at both ends. */
export function sliderValue(x: number, trackX: number, trackW: number): number {
  return Math.min(1, Math.max(0, (x - trackX) / Math.max(1, trackW)));
}

export type SliderGesture = "pending" | "drag" | "scroll";

/**
 * What a press on a slider turns into once the finger moves: a horizontal drag sets the value, a
 * mostly vertical one is a page scroll (the value is left alone). Below `threshold` in both
 * directions it is still undecided (a release then counts as a tap on the track).
 */
export function sliderGesture(dx: number, dy: number, threshold: number): SliderGesture {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return "pending";
  return Math.abs(dx) > Math.abs(dy) ? "drag" : "scroll";
}
