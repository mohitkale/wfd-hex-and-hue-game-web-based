import { solveState, type LaunchSource, type SimState } from "@hexhue/core";

/** How long the board must sit idle (nothing moving, no taps) before a hint appears. */
export const IDLE_HINT_MS = 8000;

/**
 * Solver budget for a hint. Small enough to finish in a few milliseconds on a phone (typical
 * boards solve almost greedily in far fewer nodes); when it runs out, no hint is shown.
 */
export const HINT_BUDGET = 1500;

/**
 * A launch that keeps the board winnable from an idle state: the first move of a solution found
 * by a budgeted search. `null` while wisps are moving, after the game ended, when the search runs
 * out of budget, or when no sequential win exists from here (Undo or Retry is the way out).
 */
export function hintMove(state: SimState, maxNodes = HINT_BUDGET): LaunchSource | null {
  if (state.status !== "playing" || state.track.length > 0) return null;
  const result = solveState(state, { maxNodes });
  return result.status === "solved" ? (result.solution?.[0] ?? null) : null;
}
