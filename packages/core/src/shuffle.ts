import type { Rng } from "./rng";
import { cloneState, type SimState } from "./sim";
import { solveState } from "./solver";

/**
 * Shuffle booster: re-deals every wisp still waiting in the summon columns (keeping each column's
 * length) and returns the first arrangement from which the level is still solvable, or `null` if
 * none of `attempts` tries is. The current state is never modified.
 */
export function shuffleColumns(
  state: SimState,
  rng: Rng,
  attempts = 20,
  maxNodes = 50_000,
): SimState | null {
  const pool = state.columns.flat();
  if (pool.length < 2) return null;
  const before = JSON.stringify(state.columns);
  for (let i = 0; i < attempts; i++) {
    const order = rng.shuffle(pool);
    const next = cloneState(state);
    let k = 0;
    next.columns = state.columns.map((col) => col.map(() => ({ ...order[k++]! })));
    if (JSON.stringify(next.columns) === before) continue;
    if (solveState(next, { maxNodes }).status === "solved") return next;
  }
  return null;
}
