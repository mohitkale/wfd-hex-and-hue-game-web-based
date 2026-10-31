import type { Species } from "./familiarArt";

/**
 * How each familiar moves (M15.13, owner request: every species its own movement and style, and a
 * walk that looks natural). Cosmetic only: an offset, a tilt and a squash applied on top of the
 * sprite's place, which never changes where the engine says it is. Pure, so it is tested without
 * Phaser.
 *
 * While it moves, the gait follows the stride (`strideCycle`), the same cycle that picks the walk
 * frame, so the body rises, tilts and lands in step with the legs and wings drawn in that frame:
 *
 * - bat: wingbeats, rising on the down stroke;
 * - owl: slow wingbeats and a side to side sway (a glide);
 * - cat: a trot, a little bounce on each step and a forward lean;
 * - frog: a hop per stride, up while the legs push and a squash as it lands;
 * - ant: a quick scurry, tiny bobs and a wiggle;
 * - spider: a low scuttle that rocks left and right.
 *
 * Standing still, it is a gentle version of the same style, timed by the clock.
 */
export interface Gait {
  /** Up/down offset in sprite units (negative is up). */
  dy: number;
  /** Tilt in radians. */
  rot: number;
  /** Width and height scale factors (1 is unchanged). */
  sx: number;
  sy: number;
}

export const STILL: Gait = { dy: 0, rot: 0, sx: 1, sy: 1 };

/**
 * How far (css px) each species travels in one full stride: a short stride is a quick, busy step (the
 * ant), a long one a slow, easy one (the owl). On screen a familiar walks 150 css px a second at 1×.
 */
export const STRIDE_CSS: Record<Species, number> = {
  bat: 34,
  owl: 52,
  cat: 38,
  frog: 46,
  ant: 20,
  spider: 24,
};

/** Cycle length in ms of each species' movement while it stands still. */
export const GAIT_MS: Record<Species, number> = {
  bat: 420,
  owl: 1400,
  cat: 1100,
  frog: 1300,
  ant: 600,
  spider: 900,
};

/**
 * Where a familiar of `species` is in its stride (0..1) after walking `walkedCss` css px, `offset`
 * (0..1, per familiar) keeping familiars out of step. Tied to distance walked, so the feet never slide:
 * at 3× the legs move three times as fast.
 */
export function strideCycle(species: Species, walkedCss: number, offset: number): number {
  const c = walkedCss / STRIDE_CSS[species] + offset;
  return c - Math.floor(c);
}

/** The walk or carry frame (0..frames-1) for a point `cycle` (0..1) of the stride. */
export const strideFrame = (cycle: number, frames: number): number =>
  Math.min(frames - 1, Math.floor(cycle * frames));

/**
 * The gait of a familiar of `species`. Moving, `cycle` is its point in the stride (0..1); standing
 * still, `timeMs` and `offset` (0..1) time a gentle idle version.
 */
export function gait(
  species: Species,
  moving: boolean,
  cycle: number,
  timeMs: number,
  offset = 0,
): Gait {
  if (!moving) {
    const t = (timeMs / GAIT_MS[species] + offset) * Math.PI * 2;
    switch (species) {
      case "bat":
        return { dy: Math.sin(t) * 0.5, rot: 0, sx: 1, sy: 1 };
      case "owl":
        return { dy: 0, rot: Math.sin(t) * 0.05, sx: 1, sy: 1 };
      case "frog":
        return { dy: 0, rot: 0, sx: 1 + Math.max(0, Math.sin(t)) * 0.05, sy: 1 };
      default:
        // Breathing.
        return { dy: 0, rot: 0, sx: 1, sy: 1 + Math.sin(t) * 0.03 };
    }
  }
  const t = cycle * Math.PI * 2;
  const s = Math.sin(t);
  const c = Math.cos(t);
  switch (species) {
    case "bat":
      // The wings are up at the start of the cycle (cos 1) and push down to its middle: it rises then.
      return { dy: -s * 1.1, rot: s * 0.05, sx: 1, sy: 1 };
    case "owl":
      return { dy: -s * 0.7, rot: Math.sin(t * 0.5) * 0.14, sx: 1, sy: 1 };
    case "cat": {
      // Two steps a stride: a small bounce on each, leaning into the walk.
      const bounce = Math.abs(s);
      return {
        dy: -bounce * 1.2,
        rot: 0.07 + c * 0.03,
        sx: 1 - bounce * 0.03,
        sy: 1 + bounce * 0.04,
      };
    }
    case "frog": {
      // Airborne while the legs push out (the first half of the stride), squashed as it lands.
      if (s > 0) return { dy: -s * 4.5, rot: 0, sx: 1 - s * 0.08, sy: 1 + s * 0.1 };
      const land = -s;
      return { dy: 0, rot: 0, sx: 1 + land * 0.16, sy: 1 - land * 0.14 };
    }
    case "ant":
      return { dy: -Math.abs(s) * 0.6, rot: s * 0.07, sx: 1, sy: 1 };
    case "spider":
      return { dy: -Math.abs(c) * 0.35, rot: s * 0.14, sx: 1, sy: 1 };
  }
}

/**
 * The heading (radians, 0 = head up, clockwise) of a familiar moving by `dx, dy` on screen (owner
 * request, M15.13: head and body point the way it goes).
 */
export const headingOf = (dx: number, dy: number): number => Math.atan2(dx, -dy);

/** `from` turned toward `to` by the share `k` (0..1) of the shorter way round. */
export function turnToward(from: number, to: number, k: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * Math.max(0, Math.min(1, k));
}
