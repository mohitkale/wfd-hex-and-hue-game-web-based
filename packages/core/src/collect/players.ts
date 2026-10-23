import { createRng } from "../rng";
import { apply, legalActions, type Action } from "./actions";
import type { CollectLevel } from "./level";
import { runUntilSettled } from "./sim";
import { cloneState, createCollectState, type CollectState } from "./state";

/**
 * The simulated players of docs/DIFFICULTY_V2.md §2 (M12.3): cheap, non-planning strategies that a
 * level must not be beaten by (outside the tutorial and easy tiers). Each acts only at settled
 * states, takes one legal action, and the real engine runs until settled again (the
 * settled-sequential model of GAME_DESIGN_V2 §10). None looks more than one action ahead, and none
 * uses the solver: a level is never penalised because a human or the solver finds a clever line.
 */

export const DETERMINISTIC_PLAYERS = [
  "first-front", // S1a column-spam, left to right
  "last-front", // S1b column-spam, right to left
  "round-robin", // S1c one from each column in turn
  "tidy-left", // S2 resume a waiting group, else the first front
  "tidy-right", // S3 resume a waiting group, else the last front
  "largest", // S4
  "smallest", // S5
  "most-delivered", // S7
  "clears-capacity", // S8
] as const;
export type PlayerId = (typeof DETERMINISTIC_PLAYERS)[number];

/** Random runs per level: seeds 0..199 (S6). */
export const RANDOM_RUNS = 200;

export interface RunResult {
  won: boolean;
  actions: number;
  /** The actions taken, in order (for tests and reports). */
  taken: Action[];
  /** Cubes delivered when the run ended, of `cubes` in the level. */
  delivered: number;
  cubes: number;
  /**
   * With `options.states`: the settled state before the first action and after each one (so
   * `states[k]` is the position after `k` actions), for measures that look back along a run.
   */
  states?: CollectState[];
  /** Why the run was lost (`slotsFull`, `deadlock`, or `tooLong`), or null if won. */
  lost: "slotsFull" | "deadlock" | "tooLong" | null;
}

type Pick = (state: CollectState, legal: Action[], memory: { lastColumn: number }) => Action;

const isSelect = (a: Action): a is Extract<Action, { kind: "select" }> => a.kind === "select";

/** The group an action would work with (the column front or the parked group). */
function groupOf(s: CollectState, a: Action): number {
  return a.kind === "select" ? s.columns[a.column]![0]! : s.slots[a.slot]!;
}

const remaining = (s: CollectState, a: Action): number => {
  const g = s.groups[groupOf(s, a)]!;
  return g.capacity - g.delivered;
};

/** Plays an action on a copy and returns the settled result. */
function settled(s: CollectState, a: Action): CollectState {
  const next = cloneState(s);
  apply(next, a);
  runUntilSettled(next);
  return next;
}

/** Index of the best action by `score` (larger wins), ties to the earlier one in list order. */
function argmax(legal: Action[], score: (a: Action) => number): Action {
  let best = legal[0]!;
  let bestScore = score(best);
  for (let i = 1; i < legal.length; i++) {
    const v = score(legal[i]!);
    if (v > bestScore) {
      best = legal[i]!;
      bestScore = v;
    }
  }
  return best;
}

const PICKS: Record<PlayerId, Pick> = {
  "first-front": (_s, legal) => legal.find(isSelect) ?? legal[0]!,
  "last-front": (_s, legal) => [...legal].reverse().find(isSelect) ?? legal[0]!,
  // A forced resume (no front is legal) does not move the cursor: it counts columns, not slots.
  "round-robin": (s, legal, memory) => {
    const fronts = legal.filter(isSelect);
    if (fronts.length === 0) return legal[0]!;
    const columns = s.columns.length;
    for (let i = 1; i <= columns; i++) {
      const column = (memory.lastColumn + i) % columns;
      const hit = fronts.find((a) => a.column === column);
      if (hit) {
        memory.lastColumn = column;
        return hit;
      }
    }
    return fronts[0]!; // unreachable: some front is legal, and the loop covers every column
  },
  "tidy-left": (_s, legal) => legal.find((a) => a.kind === "resume") ?? legal[0]!,
  // When no front is legal the first waiting group is taken (the rule does not say which).
  "tidy-right": (_s, legal) =>
    legal.find((a) => a.kind === "resume") ?? [...legal].reverse().find(isSelect) ?? legal[0]!,
  largest: (s, legal) => argmax(legal, (a) => remaining(s, a)),
  smallest: (s, legal) => argmax(legal, (a) => -remaining(s, a)),
  "most-delivered": (s, legal) => argmax(legal, (a) => settled(s, a).deliveredTotal),
  "clears-capacity": (s, legal) => {
    // Among actions that complete their group, the one delivering most; if none does, S7.
    const done = legal.filter((a) => {
      const g = groupOf(s, a);
      return settled(s, a).groups[g]!.status === "completed";
    });
    return argmax(done.length > 0 ? done : legal, (a) => settled(s, a).deliveredTotal);
  },
};

/** Runs one player on a level. `seed` is only used by `random`. */
export function runPlayer(
  level: CollectLevel,
  player: PlayerId | "random",
  seed = 0,
  options: { states?: boolean } = {},
): RunResult {
  const s = createCollectState(level);
  const memory = { lastColumn: -1 };
  const rng = player === "random" ? createRng(seed) : null;
  const limit = Math.max(1, 3 * s.groups.length);
  const taken: Action[] = [];
  const states: CollectState[] | undefined = options.states ? [cloneState(s)] : undefined;
  let actions = 0;
  const finish = (won: boolean, lost: RunResult["lost"]): RunResult => ({
    won,
    actions,
    taken,
    delivered: s.deliveredTotal,
    cubes: s.cubesTotal,
    lost,
    ...(states ? { states } : {}),
  });
  while (s.status === "playing") {
    if (actions >= limit) return finish(false, "tooLong");
    const legal = legalActions(s);
    if (legal.length === 0) break; // the engine ends such a state as a deadlock when ticked
    const action = rng
      ? legal[rng.int(0, legal.length - 1)]!
      : PICKS[player as PlayerId](s, legal, memory);
    apply(s, action);
    runUntilSettled(s);
    taken.push(action);
    states?.push(cloneState(s));
    actions++;
  }
  if (s.status === "won") return finish(true, null);
  return finish(false, s.status === "lost" ? s.lossReason : "deadlock");
}

/** What every player did on a level (docs/DIFFICULTY_V2.md §2). */
export interface StrategyReport {
  /** The nine deterministic players: did they win. */
  wins: Record<PlayerId, boolean>;
  /** Why each deterministic player lost, if it did. */
  losses: Partial<Record<PlayerId, "slotsFull" | "deadlock" | "tooLong">>;
  /** How many of the nine deterministic players win. */
  simpleWins: number;
  /** Fraction of random runs (seeds 0..199) that win. */
  randomRate: number;
  /** A loss was witnessed by some player (a lower bound on the level's reachable losses). */
  witnessedLoss: boolean;
}

export function strategyReport(level: CollectLevel, randomRuns = RANDOM_RUNS): StrategyReport {
  const wins = {} as Record<PlayerId, boolean>;
  const losses: StrategyReport["losses"] = {};
  let witnessed = false;
  for (const id of DETERMINISTIC_PLAYERS) {
    const r = runPlayer(level, id);
    wins[id] = r.won;
    if (r.lost) {
      losses[id] = r.lost;
      if (r.lost !== "tooLong") witnessed = true;
    }
  }
  let won = 0;
  for (let seed = 0; seed < randomRuns; seed++) {
    const r = runPlayer(level, "random", seed);
    if (r.won) won++;
    else if (r.lost && r.lost !== "tooLong") witnessed = true;
  }
  return {
    wins,
    losses,
    simpleWins: DETERMINISTIC_PLAYERS.filter((id) => wins[id]).length,
    randomRate: randomRuns === 0 ? 0 : won / randomRuns,
    witnessedLoss: witnessed,
  };
}
