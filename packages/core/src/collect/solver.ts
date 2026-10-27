import { apply, legalActions, type Action } from "./actions";
import { EMPTY } from "../level";
import type { CollectLevel } from "./level";
import { CollectSession } from "./session";
import { runUntilSettledAuto } from "./autoResume";
import { isSettled, runUntilSettled } from "./sim";
import { cloneState, createCollectState, stateKey, type CollectState } from "./state";

/**
 * The v2 solver (M12.1): exhaustive search over the **settled-sequential** model of
 * GAME_DESIGN_V2 §10, using the real engine as the transition function, so a solution is by
 * construction a line the live engine accepts and replays to a win.
 *
 * Nodes are settled states; an edge is one legal action (select a column front or resume a waiting
 * group) followed by ticks until settled. Reachability, blocking, partial groups, slots, summon
 * order, re-entry of parked groups and both losses (`slotsFull`, `deadlock`) are all decided by the
 * engine, never re-implemented here. States are merged by `stateKey` (which ignores tick, slot
 * numbers and routes), and results are cached across queries. A solver is bound to **one level**:
 * `stateKey` does not say which level a state is from (colours, slot count, group sizes), so a
 * cache shared between levels would be unsound; `solveState` rejects a state from another level.
 *
 * The search is bounded: a query that runs out of its node budget answers `unknown`, never a guess.
 * `unsolvable` and "doomed" are only reported for fully explored subtrees.
 */

export interface SolveResult {
  /** `unknown` means the node budget ran out before the question was settled. */
  status: "solved" | "unsolvable" | "unknown";
  /** A winning line of settled-sequential actions (empty when the level is won at once), or null. */
  line: Action[] | null;
  /** Child states expanded in this query. */
  nodes: number;
  /** Times a cached verdict answered a state without searching it. */
  memoHits: number;
  /** Losing transitions met (not distinct). */
  losses: number;
}

/** A state's verdict: can the game still be won from here by legal play? */
export type Verdict = "winnable" | "doomed" | "unknown";

export const DEFAULT_NODE_BUDGET = 20_000;

/**
 * A cached verdict: how a winnable state wins (straight away, or through the settled child with this
 * key) or `false` for a doomed state. The child is stored by key, not as an action, because
 * `stateKey` ignores slot numbers: the same key can have its parked groups in different slots, so a
 * stored `resume slot n` could be the wrong action. The action is re-derived when a line is read out.
 */
type Cached = { won: true } | { child: string } | false;

export class CollectSolver {
  private readonly memo = new Map<string, Cached>();
  private readonly opening: CollectState;
  private readonly openingParams: string;
  private readonly openingGroups: string;

  constructor(
    readonly level: CollectLevel,
    readonly defaultBudget = DEFAULT_NODE_BUDGET,
    /** Search the game's own policy (waiting groups resume by themselves) instead of free choice. */
    private readonly auto = false,
  ) {
    this.opening = createCollectState(level);
    this.openingParams = JSON.stringify(this.opening.params);
    this.openingGroups = JSON.stringify(this.opening.groups.map((g) => [g.color, g.capacity]));
  }

  /** Whether `state` can have been reached from this solver's level (same rules, groups and cubes). */
  private fromThisLevel(state: CollectState): boolean {
    if (JSON.stringify(state.params) !== this.openingParams) return false;
    if (JSON.stringify(state.groups.map((g) => [g.color, g.capacity])) !== this.openingGroups)
      return false;
    return state.grid.every((c, i) => c === EMPTY || c === this.opening.grid[i]);
  }
  private settle(s: CollectState): void {
    if (this.auto) runUntilSettledAuto(s);
    else runUntilSettled(s);
  }

  /** Cached verdicts (winnable and doomed states). */
  get size(): number {
    return this.memo.size;
  }

  clear(): void {
    this.memo.clear();
  }

  /** Solves the level from its opening position. */
  solve(budget = this.defaultBudget): SolveResult {
    return this.solveState(this.opening, budget);
  }

  /**
   * Solves from any state of this level (it is first run to a settled state, as the model
   * requires). Throws for a state from a different level.
   */
  solveState(start: CollectState, budget = this.defaultBudget): SolveResult {
    if (!this.fromThisLevel(start)) throw new Error("state is not from this solver's level");
    const root = cloneState(start);
    if (!isSettled(root) || this.auto) this.settle(root);
    const stats = { nodes: 0, memoHits: 0, losses: 0, exhausted: false, budget };
    if (root.status === "won") return { status: "solved", line: [], ...stats };
    if (root.status === "lost") return { status: "unsolvable", line: null, ...stats };
    const verdict = this.search(root, stats);
    if (verdict === true) return { status: "solved", line: this.extractLine(root), ...stats };
    if (verdict === false) return { status: "unsolvable", line: null, ...stats };
    return { status: "unknown", line: null, ...stats };
  }

  /** Can the game still be won from this state? */
  verdict(state: CollectState, budget = this.defaultBudget): Verdict {
    const r = this.solveState(state, budget);
    return r.status === "solved" ? "winnable" : r.status === "unsolvable" ? "doomed" : "unknown";
  }

  /** `true` winnable, `false` doomed, `undefined` budget exhausted. `state` is settled and playing. */
  private search(
    state: CollectState,
    stats: { nodes: number; memoHits: number; losses: number; exhausted: boolean; budget: number },
  ): boolean | undefined {
    const key = stateKey(state);
    const cached = this.memo.get(key);
    if (cached !== undefined) {
      stats.memoHits++;
      return cached !== false;
    }
    // Expand every legal action first, so promising children (more cubes delivered) are tried first.
    const children: { action: Action; state: CollectState }[] = [];
    for (const action of legalActions(state)) {
      if (stats.nodes >= stats.budget) {
        stats.exhausted = true;
        return undefined;
      }
      stats.nodes++;
      const next = cloneState(state);
      apply(next, action);
      this.settle(next);
      if (next.status === "won") {
        this.memo.set(key, { won: true });
        return true;
      }
      if (next.status === "lost") {
        stats.losses++;
        continue;
      }
      children.push({ action, state: next });
    }
    children.sort((a, b) => b.state.deliveredTotal - a.state.deliveredTotal);
    let unknown = false;
    for (const child of children) {
      const r = this.search(child.state, stats);
      if (r === true) {
        this.memo.set(key, { child: stateKey(child.state) });
        return true;
      }
      if (r === undefined) {
        unknown = true;
        if (stats.exhausted) return undefined;
      }
    }
    if (unknown) return undefined;
    this.memo.set(key, false);
    return false;
  }

  /**
   * Reads a winning line out of the cache from a state known to be winnable, re-deriving each action
   * against the live state: the legal action whose settled result is the cached winning child (or a
   * win). Throws if the cache and the engine disagree, which would be a solver bug.
   */
  private extractLine(root: CollectState): Action[] {
    const line: Action[] = [];
    let s = cloneState(root);
    for (let guard = 0; guard < 100_000; guard++) {
      const entry = this.memo.get(stateKey(s));
      if (!entry) throw new Error("solver cache is inconsistent");
      let step: { action: Action; state: CollectState } | null = null;
      for (const action of legalActions(s)) {
        const next = cloneState(s);
        apply(next, action);
        this.settle(next);
        const matches =
          "won" in entry
            ? next.status === "won"
            : next.status === "playing" && stateKey(next) === entry.child;
        if (matches) {
          step = { action, state: next };
          break;
        }
      }
      if (!step) throw new Error("solver cache is inconsistent");
      line.push(step.action);
      if (step.state.status === "won") return line;
      s = step.state;
    }
    throw new Error("solution line did not end");
  }
}

/** Solves a level with a fresh cache (use a `CollectSolver` to share work across queries). */
export function solve(
  level: CollectLevel,
  budget = DEFAULT_NODE_BUDGET,
  auto = false,
): SolveResult {
  return new CollectSolver(level, budget, auto).solve();
}

/**
 * Replays a solver line in the live engine, settling after each action, and returns the session:
 * the proof that a solution is a real winning play. Throws if an action is refused.
 */
export function replayLine(
  level: CollectLevel,
  line: readonly Action[],
  /** Replay under the game's own policy (waiting groups resume by themselves). */
  auto = false,
): CollectSession {
  const session = new CollectSession(level, undefined, undefined, auto);
  for (const action of line) {
    const result = session.tap(action);
    if (!result.ok)
      throw new Error(`line action ${JSON.stringify(action)} refused: ${result.reason}`);
    for (let i = 0; i < 100_000 && session.tick() !== null; i++) {
      /* run to settled */
    }
  }
  return session;
}

/**
 * The fewest holding slots with which the level can still be won, searching up from 1 to the
 * level's own slot count, with a winning line for that many slots (replay it on `{ ...level,
 * slots }`). `slots: null` when it is unwinnable even with all of them, and `unknown` is true when
 * the budget ran out before the answer was settled.
 */
export function minSlots(
  level: CollectLevel,
  budget = DEFAULT_NODE_BUDGET,
): { slots: number | null; unknown: boolean; line: Action[] | null } {
  for (let slots = 1; slots <= level.slots; slots++) {
    const r = new CollectSolver({ ...level, slots }, budget).solve();
    if (r.status === "solved") return { slots, unknown: false, line: r.line };
    if (r.status === "unknown") return { slots: null, unknown: true, line: null };
  }
  return { slots: null, unknown: false, line: null };
}
