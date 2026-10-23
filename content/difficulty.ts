/**
 * Machine-readable difficulty bands for v2 levels (docs/DIFFICULTY_V2.md). M12.3 fills `LevelMetrics`
 * by running the simulated players and the solver; M12.6 fails CI on any `checkLevel` or
 * `checkWorld` failure. Numbers are provisional (calibrated in M12.4). `difficulty.test.ts` parses
 * the doc's tier table and fails if it differs from `BANDS`.
 */

export const DETERMINISTIC_IDS = [
  "first-front", // S1a column-spam, left to right
  "last-front", // S1b column-spam, right to left
  "round-robin", // S1c one from each column in turn
  "tidy-left", // S2
  "tidy-right", // S3
  "largest", // S4
  "smallest", // S5
  "most-delivered", // S7
  "clears-capacity", // S8
] as const;
export type DeterministicId = (typeof DETERMINISTIC_IDS)[number];

/** All players: the nine deterministic ones plus `random` (S6), which reports a win rate. */
export const STRATEGY_IDS = [...DETERMINISTIC_IDS, "random"] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];

export type Tier = "tutorial" | "easy" | "medium" | "hard";
export const TIERS: readonly Tier[] = ["tutorial", "easy", "medium", "hard"];

/** Inclusive bounds; a missing side is unbounded. */
export interface Range {
  min?: number;
  max?: number;
}

export interface TierBand {
  simpleWins: Range;
  mustWin: readonly DeterministicId[];
  mustLose: readonly DeterministicId[];
  /** Pairs that must not both win. */
  notBothWin: readonly (readonly [DeterministicId, DeterministicId])[];
  randomRate: Range;
  doomedFirstShare: Range;
  deadEndShare: Range;
  freeStepShare: Range;
  solutions: Range;
  winningShare: Range;
  slack: Range;
  recoveryDepth: Range;
  planningDepth: Range;
}

/** Tutorial levels 1..LOSSLESS_TUTORIAL_LEVELS have no reachable loss; later ones need one. */
export const LOSSLESS_TUTORIAL_LEVELS = 3;

/** Most of a world's levels of a tier that any single deterministic player may win. */
export const WORLD_WIN_SHARE_CAP: Readonly<Partial<Record<Tier, number>>> = {
  medium: 0.5,
  hard: 0.25,
};

const SPAM = ["first-front", "last-front", "round-robin"] as const;

export const BANDS: Readonly<Record<Tier, TierBand>> = {
  tutorial: {
    simpleWins: { min: 6 },
    mustWin: ["first-front"],
    mustLose: [],
    notBothWin: [],
    randomRate: { min: 0.8 },
    doomedFirstShare: { max: 0 },
    deadEndShare: { max: 0.25 },
    freeStepShare: { min: 0.8 },
    solutions: { min: 2 },
    winningShare: {},
    slack: { min: 2 },
    recoveryDepth: { max: 1 },
    planningDepth: { max: 1 },
  },
  easy: {
    simpleWins: { min: 3, max: 7 },
    mustWin: [],
    mustLose: [],
    notBothWin: [],
    randomRate: { min: 0.4, max: 0.9 },
    doomedFirstShare: { max: 0.2 },
    deadEndShare: { min: 0.02, max: 0.3 },
    freeStepShare: { max: 0.7 },
    solutions: { min: 2 },
    winningShare: {},
    slack: { min: 1 },
    recoveryDepth: { max: 2 },
    planningDepth: { min: 1, max: 2 },
  },
  medium: {
    simpleWins: { max: 3 },
    mustWin: [],
    mustLose: [...SPAM],
    notBothWin: [["most-delivered", "clears-capacity"]],
    randomRate: { min: 0.05, max: 0.45 },
    doomedFirstShare: { max: 0.35 },
    deadEndShare: { min: 0.05, max: 0.5 },
    freeStepShare: { max: 0.5 },
    solutions: { min: 2 },
    winningShare: { max: 0.5 },
    slack: { min: 1 },
    recoveryDepth: { max: 3 },
    planningDepth: { min: 2, max: 4 },
  },
  hard: {
    simpleWins: { max: 1 },
    mustWin: [],
    mustLose: [...SPAM, "tidy-left", "tidy-right", "most-delivered", "clears-capacity"],
    notBothWin: [],
    randomRate: { max: 0.25 },
    doomedFirstShare: { min: 0.2, max: 0.7 },
    deadEndShare: { min: 0.15, max: 0.7 },
    freeStepShare: { max: 0.3 },
    solutions: { min: 1 },
    winningShare: { max: 0.25 },
    slack: { max: 1 },
    recoveryDepth: { max: 4 },
    planningDepth: { min: 3, max: 5 },
  },
};

/**
 * Tier by 1-based global level number: 1–5 tutorial, 6–15 easy, 16–30 medium, 31+ hard. The one
 * definition of the mapping: the stages of the curve (`curveV2.ts`, docs/V2_CURVE.md) take their
 * tier from here, and a test checks they change tier only where this does.
 */
export function tierForLevel(level: number): Tier {
  if (!Number.isInteger(level) || level < 1) throw new Error(`invalid level number ${level}`);
  if (level <= 5) return "tutorial";
  if (level <= 15) return "easy";
  if (level <= 30) return "medium";
  return "hard";
}

/** Everything the report measures for one level (docs/DIFFICULTY_V2.md §2–§3). */
export interface LevelMetrics {
  wins: Readonly<Record<DeterministicId, boolean>>;
  /** Fraction of the 200 seeded `random` runs that win. */
  randomRate: number;
  reachableLoss: boolean;
  doomedFirstShare: number;
  deadEndShare: number;
  freeStepShare: number;
  solutions: number;
  winningShare: number;
  slack: number;
  /** 0 when no loss is reached. */
  recoveryDepth: number;
  /** `Infinity` when no depth up to 5 wins. */
  planningDepth: number;
}

export const simpleWins = (m: Pick<LevelMetrics, "wins">): number =>
  DETERMINISTIC_IDS.filter((id) => m.wins[id]).length;

const inRange = (v: number, r: Range): boolean =>
  !Number.isNaN(v) && (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);

const show = (r: Range): string => `${r.min ?? "−∞"}..${r.max ?? "∞"}`;

/**
 * Every way `m` violates the band of `tier` (empty = acceptable). A tutorial level must be given its
 * 1-based `level` number: levels 1–3 may have no reachable loss, levels 4–5 need one.
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
  if (tier === "tutorial") {
    if (level === undefined) {
      out.push("tutorial levels must be checked with their level number");
    } else if (level <= LOSSLESS_TUTORIAL_LEVELS && m.reachableLoss) {
      out.push(`tutorial level ${level} must have no reachable loss`);
    } else if (level > LOSSLESS_TUTORIAL_LEVELS && !m.reachableLoss) {
      out.push(`tutorial level ${level} needs a reachable loss (to teach slots)`);
    }
  } else if (!m.reachableLoss) {
    out.push(`${tier} levels need a reachable loss (a poor choice must cost something)`);
  }
  range("doomedFirstShare", m.doomedFirstShare, band.doomedFirstShare);
  range("deadEndShare", m.deadEndShare, band.deadEndShare);
  range("freeStepShare", m.freeStepShare, band.freeStepShare);
  range("solutions", m.solutions, band.solutions);
  range("winningShare", m.winningShare, band.winningShare);
  range("slack", m.slack, band.slack);
  range("recoveryDepth", m.recoveryDepth, band.recoveryDepth);
  range("planningDepth", m.planningDepth, band.planningDepth);
  return out;
}

/** What the simulated players did on a level (the part of `LevelMetrics` M12.3 measures). */
export interface StrategyOutcome {
  wins: Readonly<Record<DeterministicId, boolean>>;
  randomRate: number;
}

/**
 * The simple-player rules of a tier's band (docs/DIFFICULTY_V2.md §5): how many of the nine cheap
 * players may win, which must win or lose, which pairs may not both win, and the random win rate.
 * Empty = acceptable. The tree measures (dead ends, slack, planning depth) are M12.4 and are
 * checked by `checkLevel`, which includes these rules.
 */
export function checkStrategies(m: StrategyOutcome, tier: Tier): string[] {
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
  return out;
}

/** The tiers whose simple-player rules a level satisfies (a level may fit none, or several). */
export const tiersSatisfied = (m: StrategyOutcome): Tier[] =>
  TIERS.filter((t) => checkStrategies(m, t).length === 0);

/**
 * World-level repetition check over one world's measured levels: for tiers with a cap, no single
 * deterministic player may win more than that share of the world's levels of the tier.
 */
export function checkWorld(
  levels: readonly { tier: Tier; metrics: Pick<LevelMetrics, "wins"> }[],
): string[] {
  const out: string[] = [];
  for (const [tier, cap] of Object.entries(WORLD_WIN_SHARE_CAP) as [Tier, number][]) {
    const inTier = levels.filter((l) => l.tier === tier);
    if (inTier.length === 0) continue;
    for (const id of DETERMINISTIC_IDS) {
      const wins = inTier.filter((l) => l.metrics.wins[id]).length;
      if (wins / inTier.length > cap) {
        out.push(`${id} wins ${wins} of ${inTier.length} ${tier} levels (cap ${cap * 100}%)`);
      }
    }
  }
  return out;
}
