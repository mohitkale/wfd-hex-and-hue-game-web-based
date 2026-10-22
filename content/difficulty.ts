/**
 * Machine-readable difficulty bands for v2 levels (docs/DIFFICULTY_V2.md). M12.3 fills `LevelMetrics`
 * by running the eight simulated players and the solver; M12.6 fails CI on any `checkLevel` or
 * `checkWorld` failure. Numbers are provisional (calibrated in M12.4) and must stay in step with the
 * doc: the tests in difficulty.test.ts pin the ones the doc states in prose.
 */

export const STRATEGY_IDS = [
  "first-front", // S1
  "tidy-left", // S2
  "tidy-right", // S3
  "largest", // S4
  "smallest", // S5
  "random", // S6 (a rate, not a win/loss)
  "most-delivered", // S7
  "clears-capacity", // S8
] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];

/** The seven deterministic players; `simpleWins` counts how many of them win. */
export type DeterministicId = Exclude<StrategyId, "random">;
export const DETERMINISTIC_IDS: readonly DeterministicId[] = STRATEGY_IDS.filter(
  (s): s is DeterministicId => s !== "random",
);

export type Tier = "tutorial" | "easy" | "medium" | "hard";
export const TIERS: readonly Tier[] = ["tutorial", "easy", "medium", "hard"];

/** Inclusive bounds; a missing side is unbounded. */
export interface Range {
  min?: number;
  max?: number;
}

export interface TierBand {
  simpleWins: Range;
  /** Deterministic players that must win. */
  mustWin: readonly DeterministicId[];
  /** Deterministic players that must lose. */
  mustLose: readonly DeterministicId[];
  /** Pairs that must not both win. */
  notBothWin: readonly (readonly [DeterministicId, DeterministicId])[];
  /** `random` win rate over the seeded runs. */
  randomRate: Range;
  /** `never`: no loss may be reachable. `required`: at least one must be. */
  reachableLoss: "never" | "allowed" | "required";
  doomedFirstShare: Range;
  /** Distinct winning settled-sequential lines found (capped at 64). */
  solutions: Range;
  winningShare: Range;
  /** `slots − minSlots`. */
  slack: Range;
  /** 95th percentile of Undos needed to recover from a loss reached by cheap play. */
  recoveryDepth: Range;
  planningDepth: Range;
}

/** Tutorial levels 1..LOSSLESS_TUTORIAL_LEVELS may have no reachable loss at all. */
export const LOSSLESS_TUTORIAL_LEVELS = 3;

export const BANDS: Readonly<Record<Tier, TierBand>> = {
  tutorial: {
    simpleWins: { min: 5 },
    mustWin: ["first-front"],
    mustLose: [],
    notBothWin: [],
    randomRate: { min: 0.8 },
    reachableLoss: "allowed",
    doomedFirstShare: { max: 0 },
    solutions: { min: 2 },
    winningShare: {},
    slack: { min: 2 },
    recoveryDepth: { max: 1 },
    planningDepth: { max: 1 },
  },
  easy: {
    simpleWins: { min: 3, max: 6 },
    mustWin: [],
    mustLose: [],
    notBothWin: [],
    randomRate: { min: 0.4, max: 0.9 },
    reachableLoss: "required",
    doomedFirstShare: { max: 0.2 },
    solutions: { min: 2 },
    winningShare: {},
    slack: { min: 1 },
    recoveryDepth: { max: 2 },
    planningDepth: { min: 1, max: 2 },
  },
  medium: {
    simpleWins: { max: 3 },
    mustWin: [],
    mustLose: ["first-front"],
    notBothWin: [["most-delivered", "clears-capacity"]],
    randomRate: { min: 0.05, max: 0.6 },
    reachableLoss: "required",
    doomedFirstShare: { max: 0.35 },
    solutions: { min: 2 },
    winningShare: { max: 0.5 },
    slack: { min: 1 },
    recoveryDepth: { max: 3 },
    planningDepth: { min: 2, max: 4 },
  },
  hard: {
    simpleWins: { max: 1 },
    mustWin: [],
    mustLose: ["first-front", "tidy-left", "tidy-right", "most-delivered", "clears-capacity"],
    notBothWin: [],
    randomRate: { max: 0.25 },
    reachableLoss: "required",
    doomedFirstShare: { min: 0.2, max: 0.7 },
    solutions: { min: 1 },
    winningShare: { max: 0.25 },
    slack: { max: 1 },
    recoveryDepth: { max: 5 },
    planningDepth: { min: 3, max: 5 },
  },
};

/** Tier by 1-based global level number (M12.5): 1–5 tutorial, 6–15 easy, 16–30 medium, 31+ hard. */
export function tierForLevel(level: number): Tier {
  if (!Number.isInteger(level) || level < 1) throw new Error(`invalid level number ${level}`);
  if (level <= 5) return "tutorial";
  if (level <= 15) return "easy";
  if (level <= 30) return "medium";
  return "hard";
}

/** Everything the report measures for one level (docs/DIFFICULTY_V2.md §2–§3). */
export interface LevelMetrics {
  /** Win/loss of each deterministic player. */
  wins: Readonly<Record<DeterministicId, boolean>>;
  randomRate: number;
  reachableLoss: boolean;
  doomedFirstShare: number;
  solutions: number;
  winningShare: number;
  slack: number;
  recoveryDepth: number;
  /** `Infinity` when no depth up to 5 wins. */
  planningDepth: number;
}

export const simpleWins = (m: Pick<LevelMetrics, "wins">): number =>
  DETERMINISTIC_IDS.filter((id) => m.wins[id]).length;

const inRange = (v: number, r: Range): boolean =>
  (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);

const show = (r: Range): string => `${r.min ?? "−∞"}..${r.max ?? "∞"}`;

/**
 * Every way `m` violates the band of `tier` (empty = acceptable). `level` is the 1-based global
 * level number, used for the lossless-tutorial rule.
 */
export function checkLevel(m: LevelMetrics, tier: Tier, level?: number): string[] {
  const band = BANDS[tier];
  const out: string[] = [];
  const range = (name: string, v: number, r: Range) => {
    if (!inRange(v, r)) out.push(`${name} ${v} outside ${show(r)} for ${tier}`);
  };
  range("simpleWins", simpleWins(m), band.simpleWins);
  for (const id of band.mustWin) if (!m.wins[id]) out.push(`${id} must win ${tier} levels`);
  for (const id of band.mustLose) if (m.wins[id]) out.push(`${id} must lose ${tier} levels`);
  for (const [a, b] of band.notBothWin) {
    if (m.wins[a] && m.wins[b]) out.push(`${a} and ${b} must not both win ${tier} levels`);
  }
  range("randomRate", m.randomRate, band.randomRate);
  if (band.reachableLoss === "required" && !m.reachableLoss) {
    out.push(`${tier} levels need a reachable loss (a poor choice must cost something)`);
  }
  if (
    tier === "tutorial" &&
    level !== undefined &&
    level <= LOSSLESS_TUTORIAL_LEVELS &&
    m.reachableLoss
  ) {
    out.push(`tutorial level ${level} must have no reachable loss`);
  }
  range("doomedFirstShare", m.doomedFirstShare, band.doomedFirstShare);
  range("solutions", m.solutions, band.solutions);
  range("winningShare", m.winningShare, band.winningShare);
  range("slack", m.slack, band.slack);
  range("recoveryDepth", m.recoveryDepth, band.recoveryDepth);
  range("planningDepth", m.planningDepth, band.planningDepth);
  return out;
}

/**
 * World-level repetition check: `largest` and `smallest` may not both win more than half of a
 * world's medium levels (one lucky level is tolerated). Returns failures, empty if fine.
 */
export function checkWorld(levels: readonly { tier: Tier; metrics: LevelMetrics }[]): string[] {
  const medium = levels.filter((l) => l.tier === "medium");
  if (medium.length === 0) return [];
  const both = medium.filter((l) => l.metrics.wins.largest && l.metrics.wins.smallest).length;
  return both / medium.length > 0.5
    ? [`largest and smallest both win ${both} of ${medium.length} medium levels`]
    : [];
}
