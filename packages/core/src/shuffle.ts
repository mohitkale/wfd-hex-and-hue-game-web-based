import type { Rng } from "./rng";
import { cloneState, type SimState } from "./sim";
import { solveState } from "./solver";

const arrangement = (columns: SimState["columns"]) =>
  columns.map((c) => c.map((w) => `${w.color}:${w.charge}`).join(",")).join("|");

/**
 * Shuffle booster: re-deals every wisp still waiting in the summon columns (keeping each column's
 * length) and returns the first visibly different arrangement from which the level is still
 * solvable, or `null` if none is found. The current state is never modified.
 *
 * Runs on the main thread when the player taps the booster, so all attempts share one solver
 * budget (`maxNodes`, default 20k launches ≈ tens of ms on a phone).
 */
export function shuffleColumns(
  state: SimState,
  rng: Rng,
  attempts = 8,
  maxNodes = 20_000,
): SimState | null {
  const pool = state.columns.flat();
  if (pool.length < 2) return null;
  const before = arrangement(state.columns);
  let budget = maxNodes;
  for (let i = 0; i < attempts && budget > 0; i++) {
    const order = rng.shuffle(pool);
    const next = cloneState(state);
    let k = 0;
    next.columns = state.columns.map((col) => col.map(() => ({ ...order[k++]! })));
    if (arrangement(next.columns) === before) continue;
    const result = solveState(next, { maxNodes: budget });
    budget -= result.nodes;
    if (result.status === "solved") return next;
  }
  return null;
}
