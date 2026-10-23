import { apply, legalActions, type Action } from "./actions";
import type { CollectLevel } from "./level";
import { CollectSession } from "./session";
import { isSettled, runUntilSettled } from "./sim";
import { cloneState, createCollectState, stateKey } from "./state";

/**
 * Test-only exhaustive search over the settled-sequential model (GAME_DESIGN_V2 §10), using the
 * real engine as the transition function. It exists to prove, headlessly, that whole puzzles are
 * solvable (or not) through the public API; the shipped solver is a separate piece of work (M12.1).
 */
export interface BruteResult {
  status: "solved" | "unsolvable" | "unknown";
  /** A winning line of settled-sequential actions, or null. */
  line: Action[] | null;
  /** Nodes expanded. */
  nodes: number;
  /** Losing transitions met while searching (not distinct: the loss path is not memoised). */
  losses: number;
}

/**
 * `memo: false` disables the `stateKey` memoisation: an exponential reference search used to check
 * that the memo never changes an answer (small levels only).
 */
export function bruteSolve(level: CollectLevel, maxNodes = 50_000, memo = true): BruteResult {
  const root = createCollectState(level);
  const seen = new Set<string>();
  const path: Action[] = [];
  let nodes = 0;
  let losses = 0;
  let exhausted = false;

  const search = (s: ReturnType<typeof createCollectState>): boolean => {
    for (const action of legalActions(s)) {
      if (nodes >= maxNodes) {
        exhausted = true;
        return false;
      }
      nodes++;
      const next = cloneState(s);
      apply(next, action);
      runUntilSettled(next);
      if (next.status === "won") {
        path.push(action);
        return true;
      }
      if (next.status === "lost") {
        losses++;
        continue;
      }
      if (memo) {
        const key = stateKey(next);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      path.push(action);
      if (search(next)) return true;
      path.pop();
      if (exhausted) return false;
    }
    return false;
  };

  if (isSettled(root) && search(root)) return { status: "solved", line: path, nodes, losses };
  return { status: exhausted ? "unknown" : "unsolvable", line: null, nodes, losses };
}

/** Plays `line` through a session (settling after each action) and returns the session. */
export function playLine(level: CollectLevel, line: readonly Action[]): CollectSession {
  const session = new CollectSession(level);
  for (const action of line) {
    const r = session.tap(action);
    if (!r.ok) throw new Error(`line action ${JSON.stringify(action)} refused: ${r.reason}`);
    for (let i = 0; i < 100_000 && session.tick() !== null; i++) {
      /* run to settled */
    }
  }
  return session;
}
