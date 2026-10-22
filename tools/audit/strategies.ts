import {
  createRng,
  createState,
  playSequential,
  sequentialMoves,
  solveState,
  type Level,
  type LaunchSource,
  type SimState,
} from "@hexhue/core";

/**
 * v1 gameplay audit (docs/V2_GAMEPLAY_AUDIT.md): simple automatic players run in the same
 * sequential model the v1 solver uses (one wisp at a time, each finishing its lap first). They
 * show how little planning the shipped levels demand.
 */

/** Picks one of the legal `moves` (never empty) from state `s`. */
export type Strategy = (s: SimState, moves: LaunchSource[], rand: () => number) => LaunchSource;

const chargeOf = (s: SimState, m: LaunchSource): number =>
  (m.kind === "column" ? s.columns[m.index]![0]! : s.slots[m.index]!).charge;

const gainOf = (s: SimState, m: LaunchSource): number =>
  s.remaining - playSequential(s, m).remaining;

/** Column fronts only while any exist; parked wisps are a last resort. */
const columnsFirst = (moves: LaunchSource[]): LaunchSource[] => {
  const columns = moves.filter((m) => m.kind === "column");
  return columns.length > 0 ? columns : moves;
};

/** First maximal (sign 1) or minimal (sign -1) element; ties keep the earlier move. */
function pick(
  moves: LaunchSource[],
  score: (m: LaunchSource) => number,
  sign: 1 | -1,
): LaunchSource {
  let best = moves[0]!;
  let bestScore = sign * score(best);
  for (const m of moves.slice(1)) {
    const v = sign * score(m);
    if (v > bestScore) {
      best = m;
      bestScore = v;
    }
  }
  return best;
}

export const STRATEGIES = {
  /** Exhaust column 1, then column 2, … (left to right). */
  "first-column": (_s, moves) => columnsFirst(moves)[0]!,
  /** Exhaust the last column first (right to left). */
  "last-column": (_s, moves) => columnsFirst(moves).at(-1)!,
  "largest-charge": (s, moves) => pick(moves, (m) => chargeOf(s, m), 1),
  "smallest-charge": (s, moves) => pick(moves, (m) => chargeOf(s, m), -1),
  random: (_s, moves, rand) => moves[Math.floor(rand() * moves.length)]!,
  /** The wisp that collects the most fragments right now. */
  "most-collected": (s, moves) => pick(moves, (m) => gainOf(s, m), 1),
  /** A wisp that will spend its whole charge now (else the most-collecting one). */
  "finishes-charge": (s, moves) => {
    const finishing = moves.filter((m) => gainOf(s, m) >= chargeOf(s, m));
    return pick(finishing.length > 0 ? finishing : moves, (m) => gainOf(s, m), 1);
  },
} satisfies Record<string, Strategy>;

export type StrategyName = keyof typeof STRATEGIES;

/** Strategies that involve randomness; their win rate is averaged over several seeds. */
export const RANDOMISED: readonly StrategyName[] = ["random"];

/**
 * Plays `strategy` from the level start. Like the solver's novice, making far more launches than
 * there are wisps counts as a loss (stuck cycling parked wisps).
 */
export function playsToWin(level: Level, strategy: Strategy, seed: number): boolean {
  const rng = createRng(seed);
  const rand = () => rng.next();
  let s = createState(level);
  const wisps = level.columns.reduce((n, c) => n + c.length, 0);
  for (let i = 0; i < wisps * 4 && s.status === "playing"; i++) {
    const moves = sequentialMoves(s);
    if (moves.length === 0) break;
    s = playSequential(s, strategy(s, moves, rand));
  }
  return s.status === "won";
}

/** Share of play-throughs won: one run for deterministic strategies, `runs` seeds for random. */
export function winRate(level: Level, name: StrategyName, runs = 40): number {
  const n = RANDOMISED.includes(name) ? runs : 1;
  let wins = 0;
  for (let k = 0; k < n; k++) if (playsToWin(level, STRATEGIES[name], 1 + k * 7919)) wins++;
  return wins / n;
}

export function winRates(level: Level, runs = 40): Record<StrategyName, number> {
  const out = {} as Record<StrategyName, number>;
  for (const name of Object.keys(STRATEGIES) as StrategyName[])
    out[name] = winRate(level, name, runs);
  return out;
}

export interface DecisionProfile {
  /** Launches in the stored solution. */
  steps: number;
  /** Mean number of legal launches per step. */
  meanMoves: number;
  /** Mean number of those that still leave the level solvable. */
  meanViable: number;
  /** Share of steps where every legal launch keeps the level winnable (nothing to get wrong). */
  freeSteps: number;
  /** Share of steps where exactly one launch keeps the level winnable (a forced move). */
  forcedSteps: number;
}

/**
 * Walks the stored `solution` and, at each state, asks the solver which legal launches keep the
 * level winnable. Budget-limited answers count as not viable, so `meanViable` may underestimate.
 */
export function decisionProfile(
  level: Level,
  solution: readonly LaunchSource[],
  maxNodes = 4000,
): DecisionProfile {
  let s = createState(level);
  let moves = 0;
  let viable = 0;
  let free = 0;
  let forced = 0;
  for (const chosen of solution) {
    const legal = sequentialMoves(s);
    const ok = legal.filter(
      (m) => solveState(playSequential(s, m), { maxNodes }).status === "solved",
    );
    moves += legal.length;
    viable += ok.length;
    if (ok.length === legal.length) free++;
    if (ok.length === 1) forced++;
    s = playSequential(s, chosen);
  }
  const n = Math.max(1, solution.length);
  return {
    steps: solution.length,
    meanMoves: moves / n,
    meanViable: viable / n,
    freeSteps: free / n,
    forcedSteps: forced / n,
  };
}
