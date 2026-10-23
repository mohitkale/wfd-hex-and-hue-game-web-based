import { apply, legalActions, type Action } from "./actions";
import { peel } from "./generator";
import type { CollectLevel } from "./level";
import { DETERMINISTIC_PLAYERS, RANDOM_RUNS, runPlayer, type PlayerId } from "./players";
import { runUntilSettled } from "./sim";
import { CollectSolver } from "./solver";
import { cloneState, createCollectState, type CollectState } from "./state";

/**
 * Decision measures of a level (M12.4, docs/DIFFICULTY_V2.md §3 and docs/V2_MEASURES.md): how many
 * genuine choices it has, how costly poor ones are, and how deep a player must plan. All are
 * computed on the settled-sequential action tree with the real engine and the solver, so none of
 * them is "how often did a player lose": a level can lose players often and have no decisions
 * (see `difficultyScore`, which deliberately ignores failure rates).
 */

export interface MeasureOptions {
  /** Solver node budget per query (default 20,000). */
  budget?: number;
  /** Cap on nodes enumerated for `winningShare` (doc: 5,000; default 1,500 to keep reports quick). */
  winningNodes?: number;
  /** Winning lines collected for `solutions` (doc: 64) and the search budget for them. */
  solutionLines?: number;
  solutionNodes?: number;
  /** Largest lookahead depth tried for `planningDepth` (doc: 5), and the nodes allowed per decision. */
  planningMax?: number;
  planningNodes?: number;
  /** Random runs (seeds 0..199 in the doc). */
  randomRuns?: number;
}

/** Everything `LevelMetrics` of content/difficulty.ts needs, plus the M12.4 decision measures. */
export interface Measures {
  // docs/DIFFICULTY_V2.md §2 and §3
  wins: Record<PlayerId, boolean>;
  randomRate: number;
  reachableLoss: boolean;
  doomedFirstShare: number;
  deadEndShare: number;
  freeStepShare: number;
  winningShare: number;
  solutions: number;
  slack: number;
  recoveryDepth: number;
  /** `Infinity` when no lookahead up to `planningMax` wins. */
  planningDepth: number;

  // M12.4: the decisions along the stored winning line
  /** Legal actions per step of the winning line, and how many of them keep the level winnable. */
  branching: number;
  effectiveBranching: number;
  /** Poor alternatives (they doom the level) that look better to the greedy player than the line's own move. */
  temptingPoorShare: number;
  /** minSlots / slots: 1 means every slot is needed. */
  slotPressure: number;
  /** Colours that are buried at the start (not reachable on the first move), and their share. */
  hiddenColors: number;
  hiddenShare: number;
  /** Share of runs that lose which an undo of at most 2 actions would rescue. */
  recoverableShare: number;
  /** Best minus worst share of the cubes delivered across the nine players and random play. */
  strategyGap: number;
  /** Ticks of the settled-sequential winning line (an upper bound on a human's time) and seconds at 1×. */
  ticks: number;
  seconds: number;

  /** What was cut short (a budget ran out), so a reader can tell a measure from a lower bound. */
  truncated: { winningShare: boolean; solutions: boolean; planning: boolean };
}

const share = (n: number, d: number): number => (d === 0 ? 0 : n / d);

const sameAction = (a: Action, b: Action): boolean =>
  a.kind === b.kind &&
  (a.kind === "select" ? a.column === (b as typeof a).column : a.slot === (b as typeof a).slot);

/** Ticks per second at 1x (the board's clock, `tickClock.ts`). */
export const TICKS_PER_SECOND = 24;

/** A settled copy of `state` after one action. */
function after(state: CollectState, action: Action): CollectState {
  const next = cloneState(state);
  apply(next, action);
  runUntilSettled(next);
  return next;
}

const freeSlots = (s: CollectState): number => s.slots.filter((x) => x === null).length;

/** The 95th percentile (nearest rank) of a list; 0 for an empty one. */
function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]!;
}

/**
 * Depth-`d` lookahead (the planning player of the difficulty document): enumerate all action
 * sequences of length `d` over settled states, score a leaf `delivered + 2 x free slots` (won +inf,
 * lost -inf), take the first action of the best sequence (ties: first in list order). Returns
 * whether it wins, or `null` if a decision needed more than `nodeCap` expansions.
 */
function lookaheadWins(level: CollectLevel, depth: number, nodeCap: number): boolean | null {
  const s = createCollectState(level);
  const limit = Math.max(1, 3 * s.groups.length);
  for (let moves = 0; s.status === "playing" && moves < limit; moves++) {
    const legal = legalActions(s);
    if (legal.length === 0) break;
    let nodes = 0;
    let exceeded = false;
    const value = (state: CollectState, d: number): number => {
      if (state.status === "won") return Infinity;
      if (state.status === "lost") return -Infinity;
      const actions = d === 0 ? [] : legalActions(state);
      if (d === 0 || actions.length === 0) return state.deliveredTotal + 2 * freeSlots(state);
      let best = -Infinity;
      for (const a of actions) {
        if (++nodes > nodeCap) {
          exceeded = true;
          return best;
        }
        best = Math.max(best, value(after(state, a), d - 1));
      }
      return best;
    };
    let bestAction = legal[0]!;
    let bestValue = -Infinity;
    for (const a of legal) {
      if (++nodes > nodeCap) return null;
      const v = value(after(s, a), depth - 1);
      if (exceeded) return null;
      if (v > bestValue) {
        bestValue = v;
        bestAction = a;
      }
    }
    apply(s, bestAction);
    runUntilSettled(s);
  }
  return s.status === "won";
}

/**
 * Measures a level. Returns `null` when the solver cannot win it (an unwinnable or too-costly level
 * has no stored line to measure decisions along, and must not be scored).
 */
export function measureLevel(level: CollectLevel, options: MeasureOptions = {}): Measures | null {
  const budget = options.budget ?? 20_000;
  const solver = new CollectSolver(level, budget);
  const solved = solver.solve();
  if (solved.status !== "solved" || !solved.line) return null;
  const root = createCollectState(level);

  // The decisions along the winning line: every legal action at every step, classified.
  let alternatives = 0;
  let doomedAlternatives = 0;
  let temptingPoor = 0;
  let freeSteps = 0;
  let branchingSum = 0;
  let effectiveSum = 0;
  let lostSeen = false;
  let ticks = 0;
  let state = cloneState(root);
  for (const lineAction of solved.line) {
    const legal = legalActions(state);
    const lineIndex = legal.findIndex((a) => sameAction(a, lineAction));
    if (lineIndex < 0) throw new Error("the solver's line has an action that is not legal");
    const own = after(state, lineAction);
    let winnable = 0;
    let stepDoomed = 0;
    for (const [index, a] of legal.entries()) {
      const isLine = index === lineIndex;
      const next = isLine ? own : after(state, a);
      let good: boolean;
      if (next.status === "won") good = true;
      else if (next.status === "lost") {
        good = false;
        lostSeen = true;
      } else good = solver.verdict(next) !== "doomed";
      if (good) winnable++;
      if (!isLine) {
        alternatives++;
        if (!good) {
          doomedAlternatives++;
          stepDoomed++;
          // Tempting: the greedy player (most cubes now) would rather take this than the line's move
          // (a tie goes to the earlier action in list order, as the greedy player breaks it).
          if (
            next.deliveredTotal > own.deliveredTotal ||
            (next.deliveredTotal === own.deliveredTotal && index < lineIndex)
          )
            temptingPoor++;
        }
      }
    }
    branchingSum += legal.length;
    effectiveSum += winnable;
    if (stepDoomed === 0) freeSteps++;
    ticks += own.tick - state.tick;
    state = own;
  }
  const steps = solved.line.length;

  // Opening: how many first moves doom the level (or lose at once).
  const first = legalActions(root);
  let doomedFirst = 0;
  for (const a of first) {
    const next = after(root, a);
    if (next.status === "lost") {
      doomedFirst++;
      lostSeen = true;
    } else if (next.status === "playing" && solver.verdict(next) === "doomed") doomedFirst++;
  }

  // winningShare: breadth-first to depth 3 (or the node cap): among the non-lost nodes at the deepest
  // fully enumerated depth (a won node counts as not doomed), the share that are not doomed.
  const cap = options.winningNodes ?? 1500;
  let frontier: CollectState[] = [root];
  let deepestPlaying: CollectState[] = [root];
  let deepestWon = 0;
  let winningTruncated = false;
  let counted = 0;
  for (let depth = 1; depth <= 3 && !winningTruncated; depth++) {
    const nextFrontier: CollectState[] = [];
    let won = 0;
    for (const st of frontier) {
      for (const a of legalActions(st)) {
        if (++counted > cap) {
          winningTruncated = true;
          break;
        }
        const n = after(st, a);
        if (n.status === "playing") nextFrontier.push(n);
        else if (n.status === "won") won++;
      }
      if (winningTruncated) break;
    }
    if (winningTruncated || nextFrontier.length + won === 0) break;
    deepestPlaying = nextFrontier;
    deepestWon = won;
    frontier = nextFrontier;
  }
  const notDoomed =
    deepestWon + deepestPlaying.filter((st) => solver.verdict(st) !== "doomed").length;
  const nonLost = deepestWon + deepestPlaying.length;
  const winningShare = nonLost === 0 ? 1 : notDoomed / nonLost;

  // solutions: distinct parking signatures among winning lines (depth-first in list order).
  const maxLines = options.solutionLines ?? 64;
  const nodeLimit = options.solutionNodes ?? 20_000;
  const signatures = new Set<string>();
  let lines = 0;
  let nodes = 0;
  let solutionsTruncated = false;
  const walk = (s: CollectState, parked: Set<number>): void => {
    if (lines >= maxLines || solutionsTruncated) return;
    for (const a of legalActions(s)) {
      if (++nodes > nodeLimit) {
        solutionsTruncated = true;
        return;
      }
      const n = after(s, a);
      if (n.status === "won") {
        lines++;
        signatures.add([...parked].sort((x, y) => x - y).join(","));
        if (lines >= maxLines) return;
        continue;
      }
      if (n.status !== "playing" || solver.verdict(n) !== "winnable") continue;
      const next = new Set(parked);
      for (const id of n.slots) if (id !== null) next.add(id);
      walk(n, next);
      if (lines >= maxLines || solutionsTruncated) return;
    }
  };
  walk(root, new Set());

  // Slots.
  let minSlotsFound = level.slots;
  for (let k = 1; k <= level.slots; k++) {
    const r = new CollectSolver({ ...level, slots: k }, budget).solve();
    if (r.status === "solved") {
      minSlotsFound = k;
      break;
    }
  }

  // Players: wins, the random rate, the gap in cubes delivered, and how far back losses can be undone.
  const wins = {} as Record<PlayerId, boolean>;
  const delivered: number[] = [];
  const recoveries: number[] = [];
  let lossesRun = 0;
  let recoverable = 0;
  let witnessedLoss = false;
  const addDelivered = (r: ReturnType<typeof runPlayer>) =>
    delivered.push(r.cubes === 0 ? 0 : r.delivered / r.cubes);
  /** Losses of `most-delivered` and random play feed the recovery measures. */
  const consider = (r: ReturnType<typeof runPlayer>) => {
    addDelivered(r);
    if (r.won || r.lost === "tooLong" || !r.states) return; // a run that ran out of actions is not a loss
    witnessedLoss = true;
    // How many actions back is the nearest position that is not doomed?
    const last = r.states.length - 1;
    let depth = 0;
    for (let k = last - 1; k >= 0; k--) {
      if (solver.verdict(r.states[k]!) !== "doomed") {
        depth = last - k;
        break;
      }
    }
    lossesRun++;
    recoveries.push(depth === 0 ? last : depth);
    if (depth > 0 && depth <= 2) recoverable++;
  };
  for (const id of DETERMINISTIC_PLAYERS) {
    const r = runPlayer(level, id, 0, { states: id === "most-delivered" });
    wins[id] = r.won;
    if (id === "most-delivered") consider(r);
    else {
      addDelivered(r);
      if (r.lost && r.lost !== "tooLong") witnessedLoss = true;
    }
  }
  const randomRuns = options.randomRuns ?? RANDOM_RUNS;
  let randomWon = 0;
  for (let seed = 0; seed < randomRuns; seed++) {
    const r = runPlayer(level, "random", seed, { states: true });
    if (r.won) randomWon++;
    consider(r);
  }

  // Planning depth: the smallest lookahead that wins; Infinity if none up to the maximum does.
  const planningMax = options.planningMax ?? 5;
  const planningNodes = options.planningNodes ?? 3000;
  let planningDepth = Infinity;
  let planningTruncated = false;
  for (let d = 1; d <= planningMax; d++) {
    const w = lookaheadWins(level, d, planningNodes);
    if (w === null) {
      // Out of budget at depth d: depths below d failed, so the true depth is at least d. Reported
      // as that lower bound and flagged (never as "beyond reach"), and not scored.
      planningTruncated = true;
      planningDepth = d;
      break;
    }
    if (w) {
      planningDepth = d;
      break;
    }
  }

  const layers = peel(level);
  const present = new Set(level.cells.filter((c) => c >= 0)).size;
  const hidden = layers.firstOpen.filter((d) => d > 0).length;
  const reachableLoss = lostSeen || doomedFirst > 0 || doomedAlternatives > 0 || witnessedLoss;

  return {
    wins,
    randomRate: randomRuns === 0 ? 0 : randomWon / randomRuns,
    reachableLoss,
    doomedFirstShare: share(doomedFirst, first.length),
    deadEndShare: share(doomedAlternatives, alternatives),
    freeStepShare: share(freeSteps, steps),
    winningShare,
    solutions: signatures.size,
    slack: level.slots - minSlotsFound,
    recoveryDepth: p95(recoveries),
    planningDepth,
    branching: share(branchingSum, steps),
    effectiveBranching: share(effectiveSum, steps),
    temptingPoorShare: share(temptingPoor, alternatives),
    slotPressure: share(minSlotsFound, level.slots),
    hiddenColors: hidden,
    hiddenShare: share(hidden, present),
    recoverableShare: lossesRun === 0 ? 1 : recoverable / lossesRun,
    strategyGap: delivered.length === 0 ? 0 : Math.max(...delivered) - Math.min(...delivered),
    ticks,
    seconds: ticks / TICKS_PER_SECOND,
    truncated: {
      winningShare: winningTruncated,
      solutions: solutionsTruncated,
      planning: planningTruncated,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The score
// ---------------------------------------------------------------------------------------------

/** One part of the difficulty score, with what it measured and how it was turned into points. */
export interface ScoreComponent {
  id: string;
  label: string;
  /** The measured value this component reads (a measure of `Measures`). */
  measure: keyof Measures;
  raw: number;
  /** `raw` scaled to 0..1 (1 = as demanding as this component gets). */
  normalised: number;
  /** Share of the total (the weights sum to 1). */
  weight: number;
  /** `normalised x weight x 100`, before renormalising when a component is left out. */
  points: number;
  /** Why the component is left out of the total (a budget cut the measure short), if it is. */
  excluded?: string;
}

export interface DifficultyScore {
  /** 0..100. */
  total: number;
  components: ScoreComponent[];
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Lookahead depth to 0..1: depth 1 needs no planning, 5 (or beyond reach) needs the most. */
const planningUnit = (d: number): number => (Number.isFinite(d) ? clamp01((d - 1) / 4) : 1);

/**
 * What each component reads and how it is scaled. Provisional (calibrated on real pools in M12.6
 * and by human play); change a number here and in docs/V2_MEASURES.md together.
 */
export const SCORE_SPEC: readonly {
  id: string;
  label: string;
  measure: keyof Measures;
  weight: number;
  unit: (m: Measures) => number;
}[] = [
  {
    id: "dead-ends",
    label: "Poor choices that cost the level",
    measure: "deadEndShare",
    weight: 0.3,
    unit: (m) => clamp01(m.deadEndShare / 0.5),
  },
  {
    id: "planning",
    label: "Planning depth needed",
    measure: "planningDepth",
    weight: 0.25,
    unit: (m) => planningUnit(m.planningDepth),
  },
  {
    id: "temptation",
    label: "Tempting but poor choices",
    measure: "temptingPoorShare",
    weight: 0.15,
    unit: (m) => clamp01(m.temptingPoorShare / 0.3),
  },
  {
    id: "opening",
    label: "Risky first moves",
    measure: "doomedFirstShare",
    weight: 0.1,
    unit: (m) => clamp01(m.doomedFirstShare / 0.5),
  },
  {
    id: "slots",
    label: "Slot pressure",
    measure: "slotPressure",
    weight: 0.1,
    unit: (m) => clamp01(m.slotPressure),
  },
  {
    id: "hidden",
    label: "Colours that start buried",
    measure: "hiddenShare",
    weight: 0.1,
    unit: (m) => clamp01(m.hiddenShare),
  },
];

/**
 * Measures recorded for every level but **not scored** because they depend on how players happen to
 * fail (`strategyGap`, `recoveryDepth`, `recoverableShare`) or on the length of play (`seconds`).
 */
export const UNSCORED: readonly (keyof Measures)[] = [
  "randomRate",
  "wins",
  "reachableLoss",
  "strategyGap",
  "recoveryDepth",
  "recoverableShare",
  "ticks",
  "seconds",
];

/**
 * The difficulty score of measured decisions (M12.4). Every component is individually inspectable.
 * **Failure rates are deliberately not inputs**: how often random play or a player loses (`randomRate`,
 * `wins`) never enters, so a level cannot be made "harder" by merely losing more; only decisions
 * count (poor choices that doom the level, how tempting they are, how far ahead one must plan,
 * slot pressure, buried colours). A level that cannot be won is not measured at all.
 */
export function difficultyScore(m: Measures): DifficultyScore {
  const components = SCORE_SPEC.map((c): ScoreComponent => {
    const normalised = clamp01(c.unit(m));
    const raw = m[c.measure] as number;
    const out: ScoreComponent = {
      id: c.id,
      label: c.label,
      measure: c.measure,
      raw,
      normalised,
      weight: c.weight,
      points: normalised * c.weight * 100,
    };
    // A lower bound is not a measurement: leave it out and rescale the rest rather than score it.
    if (c.id === "planning" && m.truncated.planning) {
      out.excluded = "planning search ran out of budget";
    }
    return out;
  });
  const used = components.filter((c) => !c.excluded);
  const weight = used.reduce((n, c) => n + c.weight, 0);
  const points = used.reduce((n, c) => n + c.points, 0);
  return { total: weight === 0 ? 0 : points / weight, components };
}
