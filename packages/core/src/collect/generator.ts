import { EMPTY } from "../level";
import { createRng, type Rng } from "../rng";
import { apply, legalActions } from "./actions";
import { computeDist, topologyFor } from "./grid";
import type { CollectLevel, GroupSpec } from "./level";
import { validateCollectLevel, type SealSpec } from "./level";
import { openingSealed, sealGate } from "./seals";
import { runUntilSettled } from "./sim";
import { CollectSolver, minSlots } from "./solver";
import { cloneState, createCollectState } from "./state";

/**
 * The v2 level generator (M12.2): turns a finished picture into a level, deterministically from a
 * seed. The picture decides which colours are open and which are buried; the generator decides the
 * groups (how many cubes each may carry), the columns and their order, and the holding slots, then
 * keeps a candidate only if the solver can win it and it has the structure the profile asks for.
 *
 * It tries a fixed number of seeded candidates and keeps the best-scoring one that meets the
 * profile (`score`: the fewest slots needed, doomed first moves, groups that must wait, buried
 * colours). It does not judge whether cheap play beats the level: that is the simulated-player gate of M12.3.
 * Everything here is structural and solver-verified.
 */

/** What the generator needs of a picture (a gameplay `Art`: one palette entry per colour family). */
export interface GeneratorArt {
  width: number;
  height: number;
  palette: string[];
  /** Palette index or `EMPTY` per cell, row-major. */
  cells: number[];
}

export type Profile = "gentle" | "standard" | "tight";

interface ProfileSpec {
  /** Target number of groups (the picture size sets their capacity). */
  groups: number;
  /** Holding slots above the fewest that still allow a win. */
  slack: number;
  /** At least this many groups must be unable to finish from the opening position. */
  minParkers: number;
  /** At least this many first moves must leave a winnable game. */
  minOpenings: number;
  /** The fewest slots that still win must be at least this. */
  minMinSlots: number;
  /** At most this share of first moves may doom the level. */
  maxDoomedFirst: number;
  /**
   * Random settled-sequential play must fail at least this often: the level has pitfalls, not just
   * groups that wait. Reached by the solver-guided refinement; 0 skips the refinement.
   */
  minRandomLoss: number;
}

export const PROFILES: Readonly<Record<Profile, ProfileSpec>> = {
  gentle: {
    groups: 12,
    slack: 2,
    minParkers: 1,
    minOpenings: 2,
    minMinSlots: 1,
    maxDoomedFirst: 0,
    minRandomLoss: 0,
  },
  standard: {
    groups: 16,
    slack: 1,
    minParkers: 2,
    minOpenings: 1,
    minMinSlots: 1,
    maxDoomedFirst: 0.5,
    minRandomLoss: 0.15,
  },
  tight: {
    groups: 20,
    slack: 0,
    minParkers: 3,
    minOpenings: 1,
    minMinSlots: 1,
    maxDoomedFirst: 0.75,
    minRandomLoss: 0.4,
  },
};

export interface GenerateOptions {
  seed: number;
  profile?: Profile;
  /** Candidates tried, the best acceptable one kept (default 12). */
  maxAttempts?: number;
  /** Solver node budget per query (default 20,000). */
  budget?: number;
  /**
   * Colours to seal partly (M13.4, docs/V2_VARIETY.md; default 0, which leaves generation exactly as
   * it was). Part of each chosen colour's cubes get a wax seal that a key colour must unlock. A seal
   * is kept only if the level stays solvable and some sealed cube is reachable at the opening, so
   * the seal can actually make a group run dry.
   */
  seals?: number;
  /** Hill-climbing steps for profiles that ask for pitfalls (default 24; 0 turns refinement off). */
  refineSteps?: number;
  /**
   * Extra acceptance test (M12.3): returns the reasons a level is not acceptable, empty if it is.
   * The hill climb then works to remove them (fewest reasons first), and
   * a level with any reason left is never returned. Costly (it runs the simulated players), so only
   * the best candidate is refined and checked.
   */
  gate?: (level: CollectLevel) => string[];
}

/** What the structure of a generated level is, so it can be inspected and gated. */
export interface GenMetrics {
  cubes: number;
  groups: number;
  /** Colours with at least one reachable cube when the game opens, and colours fully buried. */
  openColors: number;
  buriedColors: number;
  /** How many rings of cubes must be peeled before everything is reachable. */
  depth: number;
  /** Groups whose capacity exceeds the reachable cubes of their colour at the opening. */
  parkers: number;
  /** The fewest holding slots that still allow a win, and the level's slots minus that. */
  minSlots: number;
  slack: number;
  /** Legal first moves, how many keep the level winnable, and how many doom it (or lose at once). */
  firstMoves: number;
  winnableOpenings: number;
  doomedOpenings: number;
  /** Share of random settled-sequential playouts (fixed seeds) that do not win: how many pitfalls there are. */
  randomLoss: number;
}

export interface Generated {
  level: CollectLevel;
  metrics: GenMetrics;
  /** Which candidate (0-based) was kept, and how many were acceptable. */
  attempt: number;
  acceptable: number;
  /** How much structure the kept candidate has (higher is deeper); see `score`. Not comparable across profiles. */
  score: number;
}

/**
 * A candidate's structural depth: needing more slots, first moves that doom the level, groups that
 * must wait and buried colours all mean the player has real decisions to make.
 */
export function score(m: GenMetrics): number {
  const doomedShare = m.firstMoves === 0 ? 0 : m.doomedOpenings / m.firstMoves;
  return (
    4 * (m.minSlots - 1) +
    4 * doomedShare +
    0.25 * m.parkers +
    0.5 * m.buriedColors +
    6 * m.randomLoss +
    (m.winnableOpenings >= 2 ? 1 : 0)
  );
}

const POSITIVE = (n: number) => Math.max(1, Math.round(n));

/** Reachable cubes per colour in a state: a cube is reachable when a neighbouring cell is open to the portal. */
export function reachableByColor(level: CollectLevel): number[] {
  const s = createCollectState(level);
  const t = topologyFor(s.params.width, s.params.height);
  const counts = new Array<number>(level.palette.length).fill(0);
  const sealed = sealGate(s);
  s.grid.forEach((color, cell) => {
    if (color === EMPTY) return;
    for (let k = 0; k < 4; k++) {
      const n = t.neighbors[cell * 4 + k]!;
      if (n >= 0 && s.dist[n]! >= 0) {
        // A sealed cube is not one a familiar could fetch yet.
        if (!sealed || !sealed(cell)) counts[color]!++;
        return;
      }
    }
  });
  return counts;
}

/** Rings to peel (take every reachable cube, repeat) until nothing is left, and where each colour first opens. */
export function peel(level: CollectLevel): { depth: number; firstOpen: number[] } {
  const s = createCollectState(level);
  const t = topologyFor(s.params.width, s.params.height);
  const firstOpen = new Array<number>(level.palette.length).fill(-1);
  let depth = 0;
  for (let remaining = s.cubesTotal; remaining > 0; depth++) {
    const dist = computeDist(t, s.grid, s.params.portal);
    const take: number[] = [];
    s.grid.forEach((color, cell) => {
      if (color === EMPTY) return;
      for (let k = 0; k < 4; k++) {
        const n = t.neighbors[cell * 4 + k]!;
        if (n >= 0 && dist[n]! >= 0) {
          take.push(cell);
          return;
        }
      }
    });
    if (take.length === 0) break; // sealed cubes (cannot happen on a board with an open ring)
    for (const cell of take) {
      const color = s.grid[cell]!;
      if (firstOpen[color] === -1) firstOpen[color] = depth;
      s.grid[cell] = EMPTY;
    }
    remaining -= take.length;
  }
  return { depth, firstOpen };
}

/** Splits `n` cubes into group capacities around `chunk`, none tiny, summing to `n`. */
function split(n: number, chunk: number, rng: Rng): number[] {
  const sizes: number[] = [];
  let left = n;
  while (left > 0) {
    if (left <= chunk * 1.5) {
      sizes.push(left);
      break;
    }
    const take = rng.int(POSITIVE(chunk * 0.65), POSITIVE(chunk * 1.35));
    sizes.push(take);
    left -= take;
  }
  // A small remainder joins the group before it, so no group is tiny (unless the colour is).
  const floor = chunk * 0.5;
  if (sizes.length > 1 && sizes[sizes.length - 1]! < floor) {
    const last = sizes.pop()!;
    sizes[sizes.length - 1]! += last;
  }
  return sizes;
}

/** One candidate deal: groups sized from the picture, shuffled into columns. */
function deal(
  art: GeneratorArt,
  id: string,
  name: string,
  spec: ProfileSpec,
  rng: Rng,
): CollectLevel {
  const counts = new Array<number>(art.palette.length).fill(0);
  for (const c of art.cells) if (c !== EMPTY) counts[c]!++;
  const cubes = counts.reduce((a, b) => a + b, 0);
  const chunk = Math.max(6, cubes / spec.groups);
  const groups: GroupSpec[] = [];
  counts.forEach((n, color) => {
    for (const capacity of split(n, chunk, rng)) groups.push({ color, capacity });
  });
  const columnCount = groups.length <= 12 ? 3 : groups.length <= 20 ? 4 : 5;
  const columns: GroupSpec[][] = Array.from({ length: columnCount }, () => []);
  rng.shuffle(groups).forEach((g, i) => columns[i % columnCount]!.push(g));
  return {
    id,
    name,
    width: art.width,
    height: art.height,
    palette: art.palette,
    cells: art.cells,
    columns,
    slots: 8,
    squad: 4,
    spawnGap: 1,
    fieldCap: 3,
  };
}

/** Candidate seeds are derived from the level seed and the attempt so each attempt is reproducible alone. */
const mix32 = (x: number): number => {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};
/** Chained (not XORed) mixing, so distinct (seed, attempt) pairs do not trade places. */
export const attemptSeed = (seed: number, attempt: number): number =>
  mix32(mix32(seed + 0x9e3779b9) + attempt * 0x7f4a7c15 + 1);

/**
 * Generates a level for a picture. Deterministic: the same art, id, profile and seed always give
 * the same level. Returns `null` when no candidate within `maxAttempts` is solvable with the
 * structure the profile asks for (a picture can simply be too shallow for a profile).
 */
export function generateLevel(
  art: GeneratorArt,
  id: string,
  name: string,
  options: GenerateOptions,
): Generated | null {
  const seed = options.seed;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0x7fffffff)
    throw new Error("seed must be an integer in 0..2^31-1");
  const profile = options.profile ?? "standard";
  const spec = PROFILES[profile];
  const budget = options.budget ?? 20_000;
  const attempts = options.maxAttempts ?? 12;
  const refineSteps = options.refineSteps ?? 24;

  const sealCount = Math.max(0, Math.floor(options.seals ?? 0));

  // 1. Deal candidates and keep the structurally acceptable ones.
  const found: Generated[] = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const rng = createRng(attemptSeed(seed, attempt));
    const dealt = deal(art, id, name, spec, rng);
    // Seals come from their own random stream, so asking for none changes nothing above.
    const variants =
      sealCount > 0
        ? sealVariants(dealt, sealCount, createRng(attemptSeed(seed, 5000 + attempt)))
        : [dealt];
    for (const candidate of variants) {
      const result = evaluate(candidate, spec, budget, false);
      if (result) {
        found.push({ ...result, attempt, acceptable: 0, score: score(result.metrics) });
        break;
      }
    }
  }
  const acceptable = found.length;
  found.sort((a, b) => b.score - a.score || a.attempt - b.attempt);

  // 2. Profiles that ask for pitfalls refine the best few: a solver-guided search over the column
  //    order that raises how often random play fails, never leaving a level the solver cannot win.
  let best: Generated | null = null;
  const gate = options.gate;
  const refining = (spec.minRandomLoss > 0 || gate !== undefined) && refineSteps > 0;
  // The gate runs the simulated players, which is slow: only the single best candidate is refined.
  const pool = gate
    ? found.slice(0, 1)
    : spec.minRandomLoss > 0
      ? found.slice(0, 3)
      : found.slice(0, 1);
  for (const c of pool) {
    const level = refining
      ? refine(
          c.level,
          budget,
          refineSteps,
          createRng(attemptSeed(seed, 1000 + c.attempt)),
          spec,
          gate,
        )
      : c.level;
    const result = evaluate({ ...level, slots: 8 }, spec, budget, true);
    if (!result) continue;
    if (gate && gate(result.level).length > 0) continue;
    const s = score(result.metrics);
    if (!best || s > best.score) best = { ...result, attempt: c.attempt, acceptable, score: s };
  }
  return best;
}

/**
 * Up to six versions of `level` with `count` colours partly sealed, in a seeded order: for each such
 * colour a third to six tenths of its cubes (any depth) get one seal, whose key is another colour of
 * the picture. Only versions with a sealed cube reachable at the opening are returned; the solver
 * decides the rest.
 */
function sealVariants(level: CollectLevel, count: number, rng: Rng): CollectLevel[] {
  const cellsOf = new Map<number, number[]>();
  level.cells.forEach((c, i) => {
    if (c === EMPTY) return;
    const list = cellsOf.get(c) ?? [];
    list.push(i);
    cellsOf.set(c, list);
  });
  const colors = [...cellsOf.keys()].sort((a, b) => a - b);
  const variants: CollectLevel[] = [];
  if (colors.length < 2) return variants;
  for (let tries = 0; tries < 24 && variants.length < 6; tries++) {
    const seals: SealSpec[] = [];
    for (const color of rng.shuffle(colors)) {
      if (seals.length === count) break;
      const keys = colors.filter((k) => k !== color);
      const key = keys[rng.int(0, keys.length - 1)]!;
      const cells = cellsOf.get(color)!;
      const take = Math.max(1, Math.round(cells.length * (0.35 + 0.25 * rng.next())));
      seals.push({
        key,
        cells: rng
          .shuffle(cells)
          .slice(0, take)
          .sort((a, b) => a - b),
      });
    }
    if (seals.length !== count) continue;
    const candidate = { ...level, seals };
    if (validateCollectLevel(candidate).length === 0 && openingSealed(candidate) > 0)
      variants.push(candidate);
  }
  return variants;
}

/** How often random settled-sequential play (fixed seeds, so deterministic) fails to win the level. */
export function randomLossRate(level: CollectLevel, runs = 12): number {
  let failed = 0;
  for (let r = 0; r < runs; r++) {
    const rng = createRng(7919 * (r + 1));
    const s = createCollectState(level);
    for (let guard = 0; guard < 2000 && s.status === "playing"; guard++) {
      const legal = legalActions(s);
      if (legal.length === 0) break;
      apply(s, legal[rng.int(0, legal.length - 1)]!);
      runUntilSettled(s);
    }
    if (s.status !== "won") failed++;
  }
  return failed / runs;
}

/**
 * Hill-climbs on the deal (swap or move groups; shift cubes between, or merge, groups of one colour), keeping a change
 * only when the solver can still win the level and random play fails at least as often. The slot
 * count is held fixed (with a `gate` it is re-derived for each candidate), so pressure comes from the order and the group sizes. Returns the input if nothing helped. With a `gate`, fewer reasons to reject come first; more random failures only matter when the profile asks for pitfalls.
 */
function refine(
  level: CollectLevel,
  budget: number,
  steps: number,
  rng: Rng,
  spec: ProfileSpec,
  gate?: (level: CollectLevel) => string[],
): CollectLevel {
  const wantLoss = spec.minRandomLoss > 0;
  let current = level;
  let bestLoss = wantLoss ? randomLossRate(current) : 0;
  let bestProblems = gate ? gate(current).length : 0;
  // Nothing to fix: the gate accepts the candidate and it already has the pitfalls the profile asks for.
  if (gate && bestProblems === 0 && (!wantLoss || bestLoss >= spec.minRandomLoss)) return current;
  for (let step = 0; step < steps; step++) {
    const columns = current.columns.map((c) => c.map((g) => ({ ...g })));
    const places: [number, number][] = columns.flatMap((c, ci) =>
      c.map((_, gi) => [ci, gi] as [number, number]),
    );
    const a = places[rng.int(0, places.length - 1)]!;
    const b = places[rng.int(0, places.length - 1)]!;
    const move = rng.next();
    if (move < 0.35) {
      // Swap two groups.
      const tmp = columns[a[0]]![a[1]]!;
      columns[a[0]]![a[1]] = columns[b[0]]![b[1]]!;
      columns[b[0]]![b[1]] = tmp;
    } else if (move < 0.6) {
      // Move a group elsewhere.
      const [moved] = columns[a[0]]!.splice(a[1], 1);
      columns[b[0]]!.splice(Math.min(b[1], columns[b[0]]!.length), 0, moved!);
    } else if (move < 0.8) {
      // Shift cubes between two groups of one colour (bigger groups wait longer, smaller finish sooner).
      const ga = columns[a[0]]![a[1]]!;
      const gb = columns[b[0]]![b[1]]!;
      if (ga === gb || ga.color !== gb.color) continue;
      const delta = Math.min(
        ga.capacity - 1,
        Math.max(1, Math.round(ga.capacity * (0.1 + 0.4 * rng.next()))),
      );
      ga.capacity -= delta;
      gb.capacity += delta;
    } else {
      // Merge two groups of one colour into one (a bigger group that must wait for more cubes).
      const ga = columns[a[0]]![a[1]]!;
      const gb = columns[b[0]]![b[1]]!;
      if (ga === gb || ga.color !== gb.color) continue;
      ga.capacity += gb.capacity;
      columns[b[0]]!.splice(b[1], 1);
    }
    let candidate: CollectLevel = { ...current, columns };
    if (columns.some((c) => c.length === 0) || validateCollectLevel(candidate).length > 0) continue;
    if (gate) {
      // Moving groups can change how many slots the level needs: gate it at the slot count the
      // final level will have, not at the one the deal started with.
      const fewest = minSlots(candidate, budget);
      if (fewest.slots === null) continue;
      candidate = { ...candidate, slots: Math.min(8, fewest.slots + spec.slack) };
    }
    if (new CollectSolver(candidate, budget).solve().status !== "solved") continue;
    const problems = gate ? gate(candidate).length : 0;
    if (problems > bestProblems) continue;
    // With pitfalls wanted, more random failures is better; otherwise a level that is no worse is kept
    // (sideways moves let the search wander towards a tier's band instead of away from it).
    const loss = wantLoss ? randomLossRate(candidate) : 0;
    if (problems < bestProblems || !wantLoss || loss >= bestLoss) {
      bestProblems = problems;
      bestLoss = loss;
      current = candidate;
    }
  }
  return current;
}

/** Sets the slot count from the solver and checks the structure; null if the candidate is rejected. */
function evaluate(
  candidate: CollectLevel,
  spec: ProfileSpec,
  budget: number,
  enforceLoss: boolean,
): { level: CollectLevel; metrics: GenMetrics } | null {
  if (validateCollectLevel(candidate).length > 0) return null;
  // The cheapest structural test first: groups that cannot finish from the opening position.
  const opening = reachableByColor(candidate);
  const waiting = candidate.columns.flat().filter((g) => g.capacity > opening[g.color]!).length;
  if (waiting < spec.minParkers) return null;
  const fewest = minSlots(candidate, budget);
  if (fewest.slots === null) return null; // unsolvable, or too costly to tell
  if (fewest.slots < spec.minMinSlots) return null;
  const slots = Math.min(8, fewest.slots + spec.slack);
  const level: CollectLevel = { ...candidate, slots };
  if (validateCollectLevel(level).length > 0) return null;

  const reachable = opening;
  const parkers = waiting;

  // First moves: how many keep the game winnable and how many doom it.
  const solver = new CollectSolver(level, budget);
  const root = createCollectState(level);
  let winnable = 0;
  let doomed = 0;
  const first = legalActions(root);
  for (const action of first) {
    const next = cloneState(root);
    apply(next, action);
    runUntilSettled(next);
    if (next.status === "won") winnable++;
    else if (next.status === "lost") doomed++;
    else {
      const v = solver.verdict(next);
      if (v === "winnable") winnable++;
      else if (v === "doomed") doomed++;
      else return null; // too costly to classify: reject rather than guess
    }
  }
  if (winnable < spec.minOpenings) return null;
  if (first.length > 0 && doomed / first.length > spec.maxDoomedFirst) return null;
  if (solver.solve().status !== "solved") return null;
  const randomLoss = randomLossRate(level);
  if (enforceLoss && randomLoss < spec.minRandomLoss) return null;

  const open = reachable.filter((n) => n > 0).length;
  const present = new Set(level.cells.filter((c) => c !== EMPTY)).size;
  const layers = peel(level);
  return {
    level,
    metrics: {
      cubes: root.cubesTotal,
      groups: level.columns.flat().length,
      openColors: open,
      buriedColors: present - open,
      depth: layers.depth,
      parkers,
      minSlots: fewest.slots,
      slack: slots - fewest.slots,
      firstMoves: first.length,
      winnableOpenings: winnable,
      doomedOpenings: doomed,
      randomLoss,
    },
  };
}
