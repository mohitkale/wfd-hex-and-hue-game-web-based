import { EMPTY } from "../level";
import { createRng, type Rng } from "../rng";
import { apply, legalActions } from "./actions";
import { computeDist, topologyFor } from "./grid";
import type { CollectLevel, GroupSpec } from "./level";
import { validateCollectLevel } from "./level";
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
}

export const PROFILES: Readonly<Record<Profile, ProfileSpec>> = {
  gentle: {
    groups: 12,
    slack: 2,
    minParkers: 1,
    minOpenings: 2,
    minMinSlots: 1,
    maxDoomedFirst: 0,
  },
  standard: {
    groups: 16,
    slack: 1,
    minParkers: 2,
    minOpenings: 1,
    minMinSlots: 1,
    maxDoomedFirst: 0.5,
  },
  tight: {
    groups: 20,
    slack: 0,
    minParkers: 3,
    minOpenings: 1,
    minMinSlots: 2,
    maxDoomedFirst: 0.75,
  },
};

export interface GenerateOptions {
  seed: number;
  profile?: Profile;
  /** Candidates tried, the best acceptable one kept (default 12). */
  maxAttempts?: number;
  /** Solver node budget per query (default 20,000). */
  budget?: number;
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
}

export interface Generated {
  level: CollectLevel;
  metrics: GenMetrics;
  /** Which candidate (0-based) was kept, and how many were acceptable. */
  attempt: number;
  acceptable: number;
  /** How much structure the kept candidate has (higher is deeper); see `score`. */
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
    (m.winnableOpenings >= 2 ? 1 : 0)
  );
}

const POSITIVE = (n: number) => Math.max(1, Math.round(n));

/** Reachable cubes per colour in a state: a cube is reachable when a neighbouring cell is open to the portal. */
export function reachableByColor(level: CollectLevel): number[] {
  const s = createCollectState(level);
  const t = topologyFor(s.params.width, s.params.height);
  const counts = new Array<number>(level.palette.length).fill(0);
  s.grid.forEach((color, cell) => {
    if (color === EMPTY) return;
    for (let k = 0; k < 4; k++) {
      const n = t.neighbors[cell * 4 + k]!;
      if (n >= 0 && s.dist[n]! >= 0) {
        counts[color]!++;
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
const attemptSeed = (seed: number, attempt: number): number =>
  Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(attempt + 1, 0xc2b2ae35);

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
  const profile = options.profile ?? "standard";
  const spec = PROFILES[profile];
  const budget = options.budget ?? 20_000;
  const attempts = options.maxAttempts ?? 12;
  let best: Generated | null = null;
  let acceptable = 0;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const rng = createRng(attemptSeed(options.seed, attempt));
    const candidate = deal(art, id, name, spec, rng);
    const result = evaluate(candidate, spec, budget);
    if (!result) continue;
    acceptable++;
    const s = score(result.metrics);
    if (!best || s > best.score) {
      best = { level: result.level, metrics: result.metrics, attempt, acceptable: 0, score: s };
    }
  }
  return best && { ...best, acceptable };
}

/** Sets the slot count from the solver and checks the structure; null if the candidate is rejected. */
function evaluate(
  candidate: CollectLevel,
  spec: ProfileSpec,
  budget: number,
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
    },
  };
}
