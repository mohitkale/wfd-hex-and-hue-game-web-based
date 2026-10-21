import { countFragments, validateLevel, type Level, type WispSpec } from "./level";
import { createRng, type Rng } from "./rng";
import { cloneState, createState, launch, runQuiet, type LaunchSource, type SimState } from "./sim";
import { analyzeLevel, type DifficultyReport } from "./solver";

/** A finished mosaic before it becomes a puzzle: just colors on a grid. */
export interface Art {
  width: number;
  height: number;
  palette: string[];
  /** Row-major palette indices or `EMPTY`, like `Level.cells`. */
  cells: number[];
}

export interface GenerateOptions {
  seed: number;
  /** Summon columns (1..6). */
  columns: number;
  /** Holding slots K. */
  slots: number;
  /** Track cap T. */
  trackCap: number;
  /** Preferred wisp charge range. Late, sparsely exposed colors can produce smaller wisps. */
  chunk: { min: number; max: number };
  /**
   * `reach`: every wisp can finish in one lap at its natural time (gentle, tutorial levels).
   * `fixed`: each color is split into chunks regardless of reach, so many wisps need to park and
   * come back, which is where slot pressure (and most of the challenge) comes from.
   */
  charges?: "reach" | "fixed";
  /**
   * 0..1: share of wisps moved earlier in their column than the natural solving order puts them.
   * 0 keeps the natural order; higher values bury useful wisps behind ones not yet useful.
   */
  shuffle: number;
  /** If set, the solvable candidate whose difficulty is closest to this wins. */
  targetDifficulty?: number;
  /** Candidates to try (default 12). */
  attempts?: number;
  /** Random playouts per candidate for the difficulty report (default 60). */
  playouts?: number;
  /**
   * With a `targetDifficulty`, hill-climbing steps after the initial candidates (default 40). Each
   * step reorders wisps and is kept only if the level stays solvable and gets closer to target.
   */
  refine?: number;
}

export interface GeneratedLevel {
  level: Level;
  /** A verified sequential solution. */
  solution: LaunchSource[];
  report: DifficultyReport;
}

/**
 * Greedily builds a wisp sequence that clears `art` with every wisp finishing on its first lap:
 * at each step pick a color that can collect something right now (weighted by how much), and give
 * its wisp a charge no larger than what it can collect in one lap.
 */
export function naturalSequence(art: Art, rng: Rng, chunk: GenerateOptions["chunk"]): WispSpec[] {
  let s: SimState = createState({
    id: "probe",
    name: "probe",
    ...art,
    columns: [[]],
    slots: 1,
    trackCap: 1,
  });
  const left = countFragments(art);
  const sequence: WispSpec[] = [];

  const play = (state: SimState, color: number, charge: number): SimState => {
    const t = cloneState(state);
    t.slots = [null];
    t.columns = [[{ id: -1, color, charge }]];
    launch(t, { kind: "column", index: 0 });
    runQuiet(t);
    return t;
  };

  while (s.remaining > 0) {
    const reach = left.map((n, color) => (n > 0 ? s.remaining - play(s, color, n).remaining : 0));
    const total = reach.reduce((a, b) => a + b, 0);
    if (total === 0) throw new Error("art has fragments no wisp can reach");
    let pick = rng.next() * total;
    let color = reach.findIndex((r) => (pick -= r) < 0);
    if (color === -1) color = reach.length - 1;
    const n = reach[color]!;
    let charge = Math.min(n, rng.int(chunk.min, chunk.max));
    // Don't leave a tiny remainder of this color behind if this wisp can take it all now.
    if (n >= left[color]! && left[color]! - charge < chunk.min) charge = left[color]!;
    s = play(s, color, charge);
    s.slots = [null];
    left[color]! -= charge;
    sequence.push({ color, charge });
  }
  return sequence;
}

/**
 * Re-splits each color's total into `chunk`-sized wisps, ignoring one-lap reach, and orders them by
 * when their first fragment becomes available in the natural sequence.
 */
export function fixedChunks(
  natural: readonly WispSpec[],
  rng: Rng,
  chunk: GenerateOptions["chunk"],
): WispSpec[] {
  // For each color, the natural-sequence position at which its k-th fragment gets collected.
  const timeline = new Map<number, number[]>();
  natural.forEach((w, i) => {
    const t = timeline.get(w.color) ?? [];
    for (let k = 0; k < w.charge; k++) t.push(i);
    timeline.set(w.color, t);
  });
  const placed: { at: number; tie: number; wisp: WispSpec }[] = [];
  for (const [color, times] of timeline) {
    let k = 0;
    while (k < times.length) {
      let size = rng.int(chunk.min, chunk.max);
      if (times.length - (k + size) < chunk.min) size = times.length - k;
      placed.push({ at: times[k]!, tie: rng.next(), wisp: { color, charge: size } });
      k += size;
    }
  }
  placed.sort((a, b) => a.at - b.at || a.tie - b.tie);
  return placed.map((p) => p.wisp);
}

/** Deals a sequence into columns, keeping its order within each column (still solvable). */
function deal(sequence: readonly WispSpec[], columns: number, rng: Rng): WispSpec[][] {
  const out: WispSpec[][] = Array.from({ length: columns }, () => []);
  sequence.forEach((w, i) => {
    // Round-robin start keeps columns balanced; random choice hides the pattern.
    const c = i < columns ? i : rng.int(0, columns - 1);
    out[c]!.push({ ...w });
  });
  return out;
}

/** Moves each wisp (with probability `shuffle`) 1–3 places earlier in its column. */
function perturb(columns: WispSpec[][], shuffle: number, rng: Rng): WispSpec[][] {
  const out = columns.map((c) => c.map((w) => ({ ...w })));
  for (const col of out) {
    for (let i = 1; i < col.length; i++) {
      if (rng.next() >= shuffle) continue;
      const to = Math.max(0, i - rng.int(1, 3));
      const [w] = col.splice(i, 1);
      col.splice(to, 0, w!);
    }
  }
  return out;
}

/** Moves one random wisp to the front of a random column, or swaps two random wisps. */
function mutate(columns: WispSpec[][], rng: Rng): WispSpec[][] {
  const out = columns.map((c) => c.map((w) => ({ ...w })));
  const nonEmpty = out.filter((c) => c.length > 0);
  const from = nonEmpty[rng.int(0, nonEmpty.length - 1)]!;
  const i = rng.int(0, from.length - 1);
  if (rng.next() < 0.5) {
    const [w] = from.splice(i, 1);
    out[rng.int(0, out.length - 1)]!.unshift(w!);
    // Never leave a column empty: validateLevel rejects it.
    if (out.some((c) => c.length === 0)) return columns;
  } else {
    const to = nonEmpty[rng.int(0, nonEmpty.length - 1)]!;
    const j = rng.int(0, to.length - 1);
    [from[i], to[j]] = [to[j]!, from[i]!];
  }
  return out;
}

/**
 * Turns art into a solver-verified level. Tries several seeded candidates and keeps the solvable
 * one closest to `targetDifficulty` (or the first solvable one). The unperturbed natural order is
 * always a fallback, so generation only fails on art that no wisp can clear.
 */
export function generateLevel(
  art: Art,
  meta: { id: string; name: string },
  options: GenerateOptions,
): GeneratedLevel {
  const attempts = options.attempts ?? 12;
  const playouts = options.playouts ?? 60;
  let best: GeneratedLevel | null = null;
  let bestScore = Infinity;

  for (let attempt = 0; attempt <= attempts; attempt++) {
    const rng = createRng(options.seed * 1000 + attempt);
    const natural = naturalSequence(art, rng, options.chunk);
    // The last attempt is the fallback: natural order, reach-limited charges, no perturbation.
    const fallback = attempt === attempts;
    const sequence =
      options.charges === "fixed" && !fallback ? fixedChunks(natural, rng, options.chunk) : natural;
    const dealt = deal(sequence, options.columns, rng);
    const columns = fallback ? dealt : perturb(dealt, options.shuffle, rng);
    const level: Level = {
      ...meta,
      width: art.width,
      height: art.height,
      palette: art.palette.slice(),
      cells: art.cells.slice(),
      columns,
      slots: options.slots,
      trackCap: options.trackCap,
    };
    const errors = validateLevel(level);
    if (errors.length > 0) throw new Error(`generator produced an invalid level: ${errors[0]}`);
    const report = analyzeLevel(level, { playouts, seed: options.seed });
    if (report.solve.status !== "solved") continue;
    const candidate = { level, solution: report.solve.solution!, report };
    if (options.targetDifficulty === undefined) return candidate;
    const score = Math.abs(report.difficulty - options.targetDifficulty);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  if (!best) throw new Error(`no solvable level found for ${meta.id}`);

  const target = options.targetDifficulty!;
  const rng = createRng(options.seed * 1000 + 999);
  for (let i = 0; i < (options.refine ?? 40) && bestScore > 0.02; i++) {
    const columns = mutate(best.level.columns, rng);
    if (columns === best.level.columns) continue;
    const level: Level = { ...best.level, columns };
    const report = analyzeLevel(level, { playouts, seed: options.seed });
    if (report.solve.status !== "solved") continue;
    const score = Math.abs(report.difficulty - target);
    if (score < bestScore) {
      best = { level, solution: report.solve.solution!, report };
      bestScore = score;
    }
  }
  return best;
}
