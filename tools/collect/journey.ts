import { readFileSync, writeFileSync } from "node:fs";
import * as collect from "@hexhue/core/collect";
import { createRng } from "../../packages/core/src/rng";
import { checkStrategies, type Tier as Band } from "../../content/difficulty";
import {
  JOURNEY,
  MAX_BOX,
  type JourneyDeal,
  type JourneyEntry,
  type Tier,
} from "../../packages/game/src/collect/journey";

/**
 * Deals the witch's journey (M15.13), offline, into `packages/game/src/collect/journeyDeals.json`:
 *
 *   npx tsx tools/collect/journey.ts              # every level without a deal
 *   npx tsx tools/collect/journey.ts j-broom      # these levels, again
 *
 * A level keeps its board's trays and columns (`withSharedTrays`: 5 trays on a large picture, 3 or 4
 * on a small one; owner rule, a hard level is not a level with fewer trays). Its difficulty comes from
 * the picture and the deal: the boxes are cut to a size (smaller boxes, more choices) and their order
 * in the columns is hill-climbed until the cheap simulated players fit the level's tier
 * (`content/difficulty.ts`), keeping only deals the solver wins under the game's own policy. The
 * production gate checks every deal again with the full 200 random runs.
 */

const DEALS_FILE = new URL("../../packages/game/src/collect/journeyDeals.json", import.meta.url);

/**
 * What each tier asks of a level: the cheap-player band its simple strategies must fit (none for
 * easy levels, which may be won by simple play), the share of random-tapping games it may let win (the
 * owner's test: careless play must lose a hard level), and the scales of the box-size pattern
 * (`BOX_PATTERN`) to try: the preferred ones first, then larger boxes for a picture whose many small
 * boxes no deal can make winnable.
 */
export const TARGET: Record<
  Tier,
  { band: Band | null; random: [number, number]; boxes: number[] }
> = {
  easy: { band: null, random: [0.3, 1], boxes: [1.2, 1, 1.6, 2] },
  medium: { band: "medium", random: [0.05, 0.45], boxes: [1, 1.2, 0.85, 1.5] },
  hard: { band: "medium", random: [0, 0.25], boxes: [1, 1.2, 0.85, 1.5] },
  extreme: { band: "medium", random: [0, 0.1], boxes: [1, 1.2, 0.85, 1.5] },
};
const QUICK_RUNS = 60;
const STEPS = 140;

/** The smallest leftover kept as a box of its own when a colour is cut. */
export const MIN_BOX = 12;

/**
 * Box sizes, in turn (owner rules: most numbers in the 20s to 40s, a few single digits, a few higher,
 * never more than two digits; and few small boxes, so a level is not a long run of taps).
 */
export const BOX_PATTERN = [
  24, 36, 44, 28, 8, 32, 48, 24, 60, 32, 40, 8, 44, 24, 36, 72, 28, 40, 4, 36, 48, 28, 64, 40,
];

/**
 * Cuts every box into boxes of the pattern's sizes (times `scale`, never above `MAX_BOX`, two digits),
 * keeping the order the board shows them in, and deals them round the columns again.
 */
export function cut(level: collect.CollectLevel, scale: number): collect.CollectLevel {
  const order: collect.GroupSpec[] = [];
  const depth = Math.max(...level.columns.map((c) => c.length));
  for (let d = 0; d < depth; d++) for (const c of level.columns) if (c[d]) order.push(c[d]!);
  let k = 0;
  const boxes: collect.GroupSpec[] = [];
  for (const g of order) {
    let left = g.capacity;
    while (left > 0) {
      const size = Math.round(BOX_PATTERN[k++ % BOX_PATTERN.length]! * scale);
      let n = Math.min(left, Math.max(1, Math.min(MAX_BOX, size)));
      // A leftover too small to be a box of its own goes with this one (or the two share it), so a
      // colour does not end in a run of tiny boxes (owner feedback: every box is a tap).
      if (left - n > 0 && left - n < MIN_BOX) n = left <= MAX_BOX ? left : Math.ceil(left / 2);
      boxes.push({ color: g.color, capacity: n });
      left -= n;
    }
  }
  const columns: collect.GroupSpec[][] = Array.from({ length: level.columns.length }, () => []);
  boxes.forEach((g, i) => columns[i % columns.length]!.push(g));
  return { ...level, columns };
}

const solved = (level: collect.CollectLevel): boolean =>
  collect.validateCollectLevel(level).length === 0 &&
  collect.solve(level, undefined, true).status === "solved";

/**
 * Why a level misses its tier, from a strategy report: the band's rules on the simple players (its
 * random-rate rule aside: each tier sets its own window), then the random win rate if it is out.
 */
export function tierMisses(report: collect.StrategyReport, tier: Tier): string[] {
  const t = TARGET[tier];
  const out = t.band
    ? checkStrategies(report, t.band).filter((p) => !p.startsWith("randomRate"))
    : [];
  const [lo, hi] = t.random;
  if (report.randomRate < lo || report.randomRate > hi)
    out.push(
      `random wins ${Math.round(report.randomRate * 100)} %, wanted ${lo * 100}–${hi * 100} %`,
    );
  return out;
}

/** How far a level is from its tier: broken band rules, then how far the random win rate is out. */
export function distance(level: collect.CollectLevel, tier: Tier, runs: number): number {
  const report = collect.strategyReport(level, runs);
  const [lo, hi] = TARGET[tier].random;
  const off = Math.max(0, report.randomRate - hi, lo - report.randomRate);
  return tierMisses(report, tier).filter((m) => !m.startsWith("random wins")).length + off;
}

function climb(start: collect.CollectLevel, tier: Tier, seed: number) {
  const rng = createRng(seed);
  let current = start;
  let best = distance(current, tier, QUICK_RUNS);
  for (let step = 0; step < STEPS && best > 0; step++) {
    const columns = current.columns.map((c) => c.slice());
    const places = columns.flatMap((c, ci) => c.map((_, gi) => [ci, gi] as const));
    const a = places[rng.int(0, places.length - 1)]!;
    const b = places[rng.int(0, places.length - 1)]!;
    if (rng.next() < 0.6) {
      const t = columns[a[0]]![a[1]]!;
      columns[a[0]]![a[1]] = columns[b[0]]![b[1]]!;
      columns[b[0]]![b[1]] = t;
    } else {
      const [moved] = columns[a[0]]!.splice(a[1], 1);
      columns[b[0]]!.splice(Math.min(b[1], columns[b[0]]!.length), 0, moved!);
    }
    if (columns.some((c) => c.length === 0)) continue;
    const candidate = { ...current, columns };
    if (!solved(candidate)) continue;
    const d = distance(candidate, tier, QUICK_RUNS);
    if (d <= best) {
      best = d;
      current = candidate;
    }
  }
  return { level: current, distance: best };
}

/**
 * Seal variants of `level` (the last lever for a hard or extreme level): part of one colour's cubes,
 * the half nearest the middle of the board, wait under wax until every box of another colour (the
 * key) is finished. Tried for the colours with the most cubes, keyed by the others, largest first.
 */
export function sealVariants(level: collect.CollectLevel): collect.CollectLevel[] {
  const count = level.palette.map((_, c) => level.cells.filter((x) => x === c).length);
  const byCount = level.palette.map((_, c) => c).sort((a, b) => count[b]! - count[a]!);
  const mid = { x: (level.width - 1) / 2, y: (level.height - 1) / 2 };
  const out: collect.CollectLevel[] = [];
  for (const color of byCount.slice(0, 4))
    for (const key of byCount.slice(0, 4)) {
      if (key === color) continue;
      const cells = level.cells
        .map((c, i) => ({
          c,
          i,
          d: Math.hypot((i % level.width) - mid.x, Math.floor(i / level.width) - mid.y),
        }))
        .filter((e) => e.c === color)
        .sort((a, b) => a.d - b.d);
      const sealed = cells.slice(0, Math.ceil(cells.length / 2)).map((e) => e.i);
      out.push({ ...level, seals: [{ key, cells: sealed.sort((a, b) => a - b) }] });
    }
  return out;
}

/** Whether a level may get wax seals: hard or extreme, from chapter 3 on. */
export const sealsAllowed = (entry: Pick<JourneyEntry, "tier" | "chapter">): boolean =>
  (entry.tier === "hard" || entry.tier === "extreme") && entry.chapter >= SEALS_FROM_CHAPTER;

/** The first chapter whose hard and extreme levels may use wax seals. */
export const SEALS_FROM_CHAPTER = 3;

export function findDeal(
  entry: JourneyEntry,
  log: (s: string) => void = () => undefined,
): JourneyDeal | null {
  const base = entry.base();
  const near: { level: collect.CollectLevel; distance: number }[] = [];
  // A deal at the tier (with the full random runs) ends the search; one off it is kept to fall back on.
  const accept = (found: { level: collect.CollectLevel; distance: number }) => {
    const full =
      found.distance > 0 ? found.distance : distance(found.level, entry.tier, collect.RANDOM_RUNS);
    near.push({ ...found, distance: full });
    return full === 0 ? deal(found.level) : null;
  };
  for (const max of TARGET[entry.tier].boxes) {
    const start = cut(base, max);
    if (!solved(start)) {
      log(`  ${entry.id} box≤${max}: not solvable as cut`);
      continue;
    }
    let found = climb(start, entry.tier, 101 + max * 13);
    // A near miss (one rule off) often goes through from another start: two more tries.
    for (let k = 1; k <= 2 && found.distance > 0 && found.distance <= 1; k++) {
      const again = climb(found.level, entry.tier, 101 + max * 13 + k * 7919);
      if (again.distance < found.distance) found = again;
    }
    log(`  ${entry.id} box≤${max} trays=${base.slots}: ${found.distance.toFixed(2)}`);
    const kept = accept(found);
    if (kept) return kept;
  }
  // Wax seals are an extra rule to learn: only for hard and extreme levels, and never in the first two
  // chapters (owner feedback: no such complexity while a player is still learning the game).
  if (sealsAllowed(entry)) {
    const max = TARGET[entry.tier].boxes[0]!;
    for (const sealed of sealVariants(cut(base, max))) {
      if (!solved(sealed)) continue;
      const found = climb(sealed, entry.tier, 7 + sealed.seals![0]!.key);
      log(
        `  ${entry.id} sealed (colour ${sealed.cells[sealed.seals![0]!.cells[0]!]} by ${sealed.seals![0]!.key}): ${found.distance.toFixed(2)}`,
      );
      const kept = accept(found);
      if (kept) return kept;
    }
  }
  // Even box sizes, as the deals were before the pattern: a picture whose pattern cut has no winnable
  // start often has one this way.
  for (const max of [96, 72, 48]) {
    const start = even(base, max);
    if (!solved(start)) {
      log(`  ${entry.id} even box≤${max}: not solvable as cut`);
      continue;
    }
    const found = climb(start, entry.tier, 211 + max * 7);
    log(`  ${entry.id} even box≤${max}: ${found.distance.toFixed(2)}`);
    const kept = accept(found);
    if (kept) return kept;
  }
  // Nothing reached the tier: keep the closest winnable deal, marked as a miss (the production gate
  // lists it), so the level is never left without a proven deal.
  const closest = near.sort((a, b) => a.distance - b.distance)[0];
  return closest
    ? { ...deal(closest.level), missed: Number(Math.max(closest.distance, 0.01).toFixed(2)) }
    : null;
}

/** Every box cut into boxes of at most `max`, in the order the board shows them, dealt round again. */
function even(level: collect.CollectLevel, max: number): collect.CollectLevel {
  const order: collect.GroupSpec[] = [];
  const depth = Math.max(...level.columns.map((c) => c.length));
  for (let d = 0; d < depth; d++) for (const c of level.columns) if (c[d]) order.push(c[d]!);
  const boxes: collect.GroupSpec[] = [];
  for (const g of order) {
    const n = Math.ceil(g.capacity / max);
    for (let k = 0; k < n; k++)
      boxes.push({
        color: g.color,
        capacity: Math.floor(g.capacity / n) + (k < g.capacity % n ? 1 : 0),
      });
  }
  const columns: collect.GroupSpec[][] = Array.from({ length: level.columns.length }, () => []);
  boxes.forEach((g, i) => columns[i % columns.length]!.push(g));
  return { ...level, columns };
}

const deal = (level: collect.CollectLevel): JourneyDeal => ({
  columns: level.columns.map((c) => c.map((g) => [g.color, g.capacity])),
  ...(level.seals ? { seals: level.seals } : {}),
  // A winning line (the production gate replays it rather than search again).
  line: collect.solve(level, undefined, true).line ?? [],
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = () => JSON.parse(readFileSync(DEALS_FILE, "utf8")) as Record<string, JourneyDeal>;
  const only = process.argv.slice(2);
  for (const entry of JOURNEY) {
    if (only.length > 0 ? !only.includes(entry.id) : read()[entry.id]) continue;
    const t = Date.now();
    const found = findDeal(entry, (s) => process.stdout.write(`${s}\n`));
    console.log(
      `${entry.id} (${entry.tier}): ${found ? (found.missed ? `closest (${found.missed} off)` : "found") : "NOT FOUND"} (${Math.round((Date.now() - t) / 1000)} s)`,
    );
    if (found) {
      // Read again just before writing: several searches may run side by side.
      const deals = read();
      deals[entry.id] = found;
      writeFileSync(DEALS_FILE, `${JSON.stringify(deals)}\n`);
    }
  }
}
