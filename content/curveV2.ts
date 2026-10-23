import { checkStrategies, type Range, type StrategyOutcome, type Tier } from "./difficulty";

/**
 * The v2 difficulty progression (docs/V2_CURVE.md, M12.5): which skills each stretch of levels
 * teaches and the machine-checkable bands that follow from it. Consumed by the level pipeline
 * (`tools/art/levels.ts` takes a piece's target tier from its level number) and by the checks below;
 * a level, or a world, that deviates fails. Numbers are provisional and calibrated on real pools
 * (M12.6) and by human play (G3).
 *
 * Difficulty must rise through **decisions**, not through longer animations or more cubes: every
 * stage shares the same length cap and the score never reads length.
 */

/** A requirement on one measure of a level (a decision a stage must contain). */
export interface Requirement {
  measure: StageMeasure;
  min?: number;
  max?: number;
  /** Shown when it fails. */
  why: string;
}

/** The measures the curve reads (a subset of core's `Measures`, plus the score). */
export const STAGE_MEASURES = [
  "score",
  "deadEndShare",
  "temptingPoorShare",
  "doomedFirstShare",
  "planningDepth",
  "hiddenColors",
  "slotPressure",
  "cubes",
  "seconds",
] as const;
export type StageMeasure = (typeof STAGE_MEASURES)[number];

export interface Stage {
  id: "learn" | "blocked-and-slots" | "partial-and-dependencies" | "ordering" | "advanced";
  name: string;
  /** First and last level number (1-based, inclusive); the last stage has no end. */
  from: number;
  to: number;
  tier: Tier;
  /** What the stage teaches (shown to designers and in the report). */
  teaches: string;
  /** The difficulty score (core `difficultyScore`) must lie in this band. */
  score: Range;
  /** Decisions every level of the stage must contain. */
  requires: readonly Requirement[];
}

export const STAGES: readonly Stage[] = [
  {
    id: "learn",
    name: "Learn collection",
    from: 1,
    to: 5,
    tier: "tutorial",
    teaches: "Send a group, watch it collect and deliver; the first groups that must wait.",
    score: { min: 0, max: 20 },
    requires: [],
  },
  {
    id: "blocked-and-slots",
    name: "Blocked colours and slots",
    from: 6,
    to: 15,
    tier: "easy",
    teaches: "A colour can be buried under others; waiting groups use the holding slots.",
    score: { min: 8, max: 35 },
    requires: [{ measure: "hiddenColors", min: 1, why: "blocked colours must be present" }],
  },
  {
    id: "partial-and-dependencies",
    name: "Partial groups and dependencies",
    from: 16,
    to: 30,
    tier: "medium",
    teaches: "A group may be too big for what is open: what to clear first becomes a decision.",
    score: { min: 20, max: 55 },
    requires: [
      { measure: "hiddenColors", min: 1, why: "blocked colours must be present" },
      { measure: "deadEndShare", min: 0.02, why: "a poor choice must be able to cost the level" },
    ],
  },
  {
    id: "ordering",
    name: "Ordering decisions",
    from: 31,
    to: 50,
    tier: "hard",
    teaches: "Which group first, and which can wait: choices that look good and are not.",
    score: { min: 35, max: 75 },
    requires: [
      { measure: "deadEndShare", min: 0.05, why: "dead ends must be common enough to matter" },
      { measure: "temptingPoorShare", min: 0.02, why: "some poor choices must be tempting" },
      { measure: "planningDepth", min: 2, why: "the level must need more than greedy play" },
    ],
  },
  {
    id: "advanced",
    name: "Advanced combinations",
    from: 51,
    to: Number.POSITIVE_INFINITY,
    tier: "hard",
    teaches: "All of it at once, with little slack.",
    score: { min: 50, max: 100 },
    requires: [
      { measure: "deadEndShare", min: 0.1, why: "dead ends must be common" },
      { measure: "temptingPoorShare", min: 0.05, why: "tempting poor choices must be common" },
      { measure: "planningDepth", min: 3, why: "the level must need real planning" },
    ],
  },
];

/**
 * The length no level of any stage may exceed: settled-sequential seconds (an upper bound) and
 * cubes. The same caps apply to every stage, so a level cannot be made harder by making it longer;
 * and the difficulty score never reads length (`UNSCORED` in core), so it cannot rise with it.
 */
export const MAX_SECONDS = 420;
export const MAX_CUBES = 700;
/** Each populated stage's mean score must beat the previous populated stage's by at least this much. */
export const MIN_STAGE_STEP = 3;

export function stageForLevel(level: number): Stage {
  if (!Number.isInteger(level) || level < 1) throw new Error(`invalid level number ${level}`);
  return STAGES.find((s) => level >= s.from && level <= s.to)!;
}

/** What the curve needs to know about one level. */
export interface CurveEntry {
  /** 1-based level number in its world's play order. */
  level: number;
  id: string;
  cubes: number;
  /** The measures named in `STAGE_MEASURES` (planningDepth may be Infinity; cubes and seconds as measured). */
  measures: Readonly<Record<Exclude<StageMeasure, "cubes">, number>>;
  /** What the simulated players did (docs/V2_STRATEGIES.md). */
  strategies: StrategyOutcome;
  reachableLoss: boolean;
}

const read = (e: CurveEntry, measure: StageMeasure): number =>
  measure === "cubes" ? e.cubes : e.measures[measure];

const inRange = (v: number, r: Range): boolean =>
  !Number.isNaN(v) && (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);

/** Every way one level deviates from its stage (empty = on the curve). */
export function checkEntry(e: CurveEntry): string[] {
  const stage = stageForLevel(e.level);
  const out: string[] = [];
  const tag = `level ${e.level} (${e.id}, ${stage.id})`;
  // The stage's tier: what the cheap players must do (docs/DIFFICULTY_V2.md §5).
  for (const problem of checkStrategies(e.strategies, stage.tier)) out.push(`${tag}: ${problem}`);
  // Tutorial levels 1-3 are lossless, 4-5 need a loss (the slots lesson).
  if (stage.tier === "tutorial") {
    if (e.level <= 3 && e.reachableLoss) out.push(`${tag}: levels 1-3 must have no reachable loss`);
    if (e.level > 3 && !e.reachableLoss) out.push(`${tag}: levels 4-5 need a reachable loss`);
  } else if (!e.reachableLoss) out.push(`${tag}: a poor choice must be able to cost something`);
  if (!inRange(e.measures.score, stage.score)) {
    out.push(`${tag}: score ${round(e.measures.score)} outside ${show(stage.score)}`);
  }
  for (const r of stage.requires) {
    const v = read(e, r.measure);
    if (!inRange(v, r)) out.push(`${tag}: ${r.measure} ${round(v)} outside ${show(r)}: ${r.why}`);
  }
  if (e.measures.seconds > MAX_SECONDS)
    out.push(`${tag}: ${round(e.measures.seconds)} s is over the ${MAX_SECONDS} s length cap`);
  if (e.cubes > MAX_CUBES) out.push(`${tag}: ${e.cubes} cubes is over the ${MAX_CUBES} cube cap`);
  return out;
}

/**
 * Every way a world's levels deviate from the curve (empty = on it): each level against its stage,
 * level numbers unique, and stage means rising by at least `MIN_STAGE_STEP`. `entries` need not cover every level number (a library is placed on the curve piece
 * by piece), but a populated stage's mean is only compared with the stages before it.
 */
export function checkCurve(entries: readonly CurveEntry[]): string[] {
  const out: string[] = [];
  const seen = new Set<number>();
  for (const e of entries) {
    if (seen.has(e.level)) out.push(`level ${e.level} is used twice`);
    seen.add(e.level);
    out.push(...checkEntry(e));
  }
  const populated = STAGES.map((stage) => ({
    stage,
    levels: entries.filter((e) => e.level >= stage.from && e.level <= stage.to),
  })).filter((s) => s.levels.length > 0);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (let i = 1; i < populated.length; i++) {
    const before = mean(populated[i - 1]!.levels.map((e) => e.measures.score));
    const now = mean(populated[i]!.levels.map((e) => e.measures.score));
    if (now < before + MIN_STAGE_STEP) {
      out.push(
        `stage ${populated[i]!.stage.id} (mean score ${round(now)}) must rise at least ${MIN_STAGE_STEP} above ${populated[i - 1]!.stage.id} (${round(before)})`,
      );
    }
  }
  return out;
}

const round = (x: number): string => (Number.isFinite(x) ? String(Math.round(x * 100) / 100) : "∞");
const show = (r: Range): string => `${r.min ?? "−∞"}..${r.max ?? "∞"}`;
