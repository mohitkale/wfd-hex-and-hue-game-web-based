import type { TrackCell } from "@hexhue/core";
import { cellCenter, type Layout } from "./layout";

/** Simulation step length at 1× speed. A 12×12 board's lap (52 cells) takes ~3 s. */
export const TICK_MS = 60;

/** Speeds the player can choose; 2× is unlocked per level (see GAME_DESIGN §3). */
export type Speed = 1 | 2;

export interface Point {
  x: number;
  y: number;
}

/**
 * Screen position of a track wisp `alpha` (0..1) of the way through the current step. The engine
 * state is already post-step, so the wisp moves from `pos - 1` to `pos`; a just-launched wisp
 * (`traveled === 0`) sits on the entry.
 */
export function trackPosition(
  layout: Layout,
  track: readonly TrackCell[],
  wisp: { pos: number; traveled: number },
  alpha: number,
): Point {
  const to = track[wisp.pos]!;
  if (wisp.traveled === 0) return cellCenter(layout, to.x, to.y);
  const from = track[(wisp.pos - 1 + track.length) % track.length]!;
  const t = Math.min(1, Math.max(0, alpha));
  return cellCenter(layout, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
}

/** Frame-rate independent exponential approach of `current` towards `target`. */
export function approach(current: number, target: number, dtMs: number, rate = 18): number {
  return target + (current - target) * Math.exp((-rate * dtMs) / 1000);
}

/**
 * Advances a fixed-timestep accumulator. Returns how many simulation steps to run this frame and
 * the leftover time. Long frames (tab in background) are capped so the game never fast-forwards
 * through a whole level at once.
 */
export function accumulate(
  accMs: number,
  deltaMs: number,
  speed: Speed,
  maxSteps = 4,
): { steps: number; acc: number } {
  let acc = accMs + Math.min(deltaMs, 250) * speed;
  let steps = 0;
  while (acc >= TICK_MS && steps < maxSteps) {
    acc -= TICK_MS;
    steps++;
  }
  if (steps === maxSteps) acc = Math.min(acc, TICK_MS - 1);
  return { steps, acc };
}
