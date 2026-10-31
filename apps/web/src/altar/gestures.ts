/**
 * Gestures on the altar cloth, as pure maths on pointer samples (CSS pixels, y down):
 * - a circle round the cloth's centre, sunwise (clockwise on screen, with north at the top) or
 *   widdershins, once most of the way round;
 * - a straight stroke, up, down, left or right;
 * - a tap, which barely moves.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A circle counts once it has gone this far round (degrees): forgiving, not a test of drawing. */
export const CIRCLE_DEGREES = 300;
/** Below this path length (px) a press is a tap. */
export const TAP_PX = 12;
/** A stroke must be at least this long (px) and mostly in one direction. */
export const STROKE_PX = 28;

export function pathLength(points: readonly Point[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) {
    n += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return n;
}

export const isTap = (points: readonly Point[]) => pathLength(points) < TAP_PX;

/** Signed degrees swept round `centre`; positive is clockwise on screen. */
export function sweptDegrees(points: readonly Point[], centre: Point): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = Math.atan2(points[i - 1]!.y - centre.y, points[i - 1]!.x - centre.x);
    const b = Math.atan2(points[i]!.y - centre.y, points[i]!.x - centre.x);
    let d = b - a;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  return (total * 180) / Math.PI;
}

/**
 * Which way a circle went, or null when it was not (most of) a circle. Points too close to the
 * centre are ignored, since their angle jumps about.
 */
export function circleDirection(
  points: readonly Point[],
  centre: Point,
  minRadius = 20,
): "sunwise" | "widdershins" | null {
  const far = points.filter((p) => Math.hypot(p.x - centre.x, p.y - centre.y) >= minRadius);
  const deg = sweptDegrees(far, centre);
  if (deg >= CIRCLE_DEGREES) return "sunwise";
  if (deg <= -CIRCLE_DEGREES) return "widdershins";
  return null;
}

/** The direction of a straight stroke, or null when it is short or diagonal. */
export function strokeDirection(points: readonly Point[]): "up" | "down" | "left" | "right" | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  if (Math.hypot(dx, dy) < STROKE_PX) return null;
  // Mostly one way: the main axis at least twice the other.
  if (Math.abs(dy) >= 2 * Math.abs(dx)) return dy < 0 ? "up" : "down";
  if (Math.abs(dx) >= 2 * Math.abs(dy)) return dx < 0 ? "left" : "right";
  return null;
}
