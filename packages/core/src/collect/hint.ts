import { explain, type Action } from "./actions";
import type { CollectLevel } from "./level";
import { CollectSolver } from "./solver";
import type { CollectState } from "./state";

/** Largest solver budget a hint may spend: it runs between taps, so it must stay quick. */
export const HINT_BUDGET = 4_000;

/** What a hint says. Only `move` and `doomed` are worth a charge. */
export type Hint =
  /** Tap this: the level is still winnable after it (with settled play). */
  | { kind: "move"; action: Action }
  /** No legal play wins from here: Undo (or Retry) is the way out. */
  | { kind: "doomed" }
  /** The solver could not decide within its budget. */
  | { kind: "unknown" }
  /** A winning line exists but its first move is not legal until the board settles. */
  | { kind: "wait" }
  /** The game is over. */
  | { kind: "over" };

/**
 * Hint booster (replaces v1's Shuffle): the first move of a winning line from the current state,
 * searched with the real engine. Never a guess: an undecided search is reported as `unknown`.
 * `level` must be the level `state` is being played on (the extra slots it has gained are
 * accounted for).
 */
export function hintFor(
  level: CollectLevel,
  state: CollectState,
  budget = HINT_BUDGET,
  /** Search the game's own policy (waiting groups resume by themselves). */
  auto = false,
): Hint {
  if (state.status !== "playing") return { kind: "over" };
  const solver = new CollectSolver({ ...level, slots: state.params.slots }, budget, auto);
  const r = solver.solveState(state, budget);
  if (r.status === "unsolvable") return { kind: "doomed" };
  if (r.status === "unknown" || !r.line) return { kind: "unknown" };
  const first = r.line[0];
  // A level won at once has an empty line: nothing to suggest, the game ends by itself.
  if (!first) return { kind: "wait" };
  return explain(state, first) === "ok" ? { kind: "move", action: { ...first } } : { kind: "wait" };
}
