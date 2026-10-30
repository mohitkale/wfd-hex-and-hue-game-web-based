import * as collect from "@hexhue/core/collect";
import { createRng } from "@hexhue/core";
import { ART_LEVELS } from "./artLevels";
import { dailyLevelId, dayNumber, utcDate } from "./daily";
import { TUTORIAL, TUTORIAL_IDS } from "./tutorialLevels";
import { nextTutorial, shouldOfferTutorial, type TutorialBook } from "./tutorialBook";
import { layeredOrb } from "./denseBoard";
import { withSharedTrays } from "./trayRules";
import { toPictureBoard } from "./pictureBoard";
import { moonlitHat } from "./slice";
import { JOURNEY, challengeOf, type Tier } from "./journey";

/**
 * Levels by name (`?level=`): the journey, the tutorial and the dev boards. The vertical-slice level (M10.5) replaces `demo` as the
 * default; these exist so the engine, familiars and board can be played and measured now.
 */

const PALETTE = ["#4a6be2", "#e24a4a", "#4ae26b", "#f2c94c", "#b44ae2", "#4ae2d8"];

function fromRows(
  id: string,
  name: string,
  rows: string[],
  colors: string,
  columns: [string, number][][],
  opts: Partial<collect.CollectLevel> = {},
): collect.CollectLevel {
  return {
    id,
    name,
    width: rows[0]!.length,
    height: rows.length,
    palette: PALETTE.slice(0, colors.length),
    cells: rows.flatMap((r) => [...r].map((c) => (c === "." ? -1 : colors.indexOf(c)))),
    columns: columns.map((col) =>
      col.map(([c, capacity]) => ({ color: colors.indexOf(c), capacity })),
    ),
    slots: 3,
    squad: 3,
    spawnGap: 2,
    fieldCap: 3,
    ...opts,
  };
}

/** The teaching board from the design doc (fixture B): park, resume, or lose with one slot. */
export const parking = (): collect.CollectLevel =>
  fromRows(
    "dev-parking",
    "Parking (dev)",
    ["BBBBB", "BRBGB", "BBBBB", "BRBGB"],
    "BRG",
    [[["R", 2]], [["G", 2]], [["B", 16]]],
    { slots: 1 },
  );

/**
 * The wax-seal tutorial (M13.4, docs/V2_VARIETY.md): all the gold is sealed by violet, so the gold
 * group cannot start (the tap says why) until the violet is gathered. One lesson, no
 * trap: one line (violet, then gold).
 */
export const sealsIntro = (): collect.CollectLevel =>
  fromRows(
    "dev-seals-intro",
    "Wax Seals",
    ["GGGGGG", "GGGGGG", "VVVVVV", "VVVVVV"],
    "GV",
    [[["G", 12]], [["V", 12]]],
    {
      palette: ["#f2c94c", "#b44ae2"],
      slots: 2,
      fieldCap: 2,
      seals: [{ key: 1, cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
    },
  );

/** Purple 12 with only 7 reachable: it waits showing 5 until the blue is cleared. */
export const purple12 = (): collect.CollectLevel =>
  fromRows(
    "dev-purple12",
    "Purple 12 (dev)",
    ["BBBBBBB", "BPPPPPB", "BBBBBBB", "PPPPPPP"],
    "BP",
    [[["P", 12]], [["B", 16]]],
    { slots: 2, spawnGap: 1 },
  );

/** A crescent moon in three layers of colour; groups are dealt at random (seeded). */
export function demoMoon(): collect.CollectLevel {
  const w = 20;
  const h = 18;
  const dist = (x: number, y: number, cx: number, cy: number) => Math.hypot(x - cx, y - cy);
  const cells: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inMoon = dist(x, y, 8.5, 8.5) <= 7.4 && dist(x, y, 11.6, 7.2) > 6.1;
      const nearMoon = dist(x, y, 8.5, 8.5) <= 8.6 && dist(x, y, 11.6, 7.2) > 5.4;
      const star = (x * 7 + y * 13) % 17 === 0 && !nearMoon;
      cells.push(inMoon ? 3 : nearMoon ? 4 : star ? 5 : (x + y) % 9 === 0 ? 0 : -1);
    }
  }
  const counts = new Array<number>(6).fill(0);
  for (const c of cells) if (c >= 0) counts[c]!++;
  for (let seed = 1; seed < 200; seed++) {
    const rng = createRng(seed);
    const groups: collect.GroupSpec[] = [];
    counts.forEach((n, color) => {
      let left = n;
      while (left > 0) {
        const take = left <= 14 ? left : rng.int(6, 14);
        groups.push({ color, capacity: take });
        left -= take;
      }
    });
    const dealt = rng.shuffle(groups);
    const columns: collect.GroupSpec[][] = [[], [], []];
    dealt.forEach((g, i) => columns[i % 3]!.push(g));
    const level: collect.CollectLevel = {
      id: "dev-moon",
      name: "Crescent (dev)",
      width: w,
      height: h,
      palette: PALETTE,
      cells,
      columns,
      slots: 4,
      squad: 3,
      spawnGap: 2,
      fieldCap: 3,
    };
    if (collect.validateCollectLevel(level).length === 0) return level;
  }
  throw new Error("could not deal a valid demo level");
}

/**
 * Vertical stripes of one colour each, so every group can always finish (no hidden colours): a pure
 * load test for the renderer (many cubes, many familiars at once). `size` cells square, `colors`
 * stripes, groups of about `chunk` cubes dealt at random into columns.
 */
export function stripes(
  id: string,
  name: string,
  size: number,
  colors: number,
  chunk: number,
  opts: Partial<collect.CollectLevel> = {},
): collect.CollectLevel {
  const stripe = Math.ceil(size / colors);
  const cells: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) cells.push(Math.min(colors - 1, Math.floor(x / stripe)));
  }
  const counts = new Array<number>(colors).fill(0);
  for (const c of cells) counts[c]!++;
  const rng = createRng(7);
  const groups: collect.GroupSpec[] = [];
  counts.forEach((n, color) => {
    let left = n;
    while (left > 0) {
      const take =
        left <= chunk * 1.5 ? left : rng.int(Math.round(chunk * 0.7), Math.round(chunk * 1.3));
      groups.push({ color, capacity: take });
      left -= take;
    }
  });
  const dealt = rng.shuffle(groups);
  const columns: collect.GroupSpec[][] = [[], [], [], [], []];
  dealt.forEach((g, i) => columns[i % columns.length]!.push(g));
  return {
    id,
    name,
    width: size,
    height: size,
    palette: PALETTE.slice(0, colors),
    cells,
    columns,
    slots: 5,
    squad: 6,
    spawnGap: 1,
    fieldCap: 6,
    ...opts,
  };
}

export const DEV_LEVELS: Record<string, () => collect.CollectLevel> = {
  /** The M10.5 vertical slice (gate G1), played with every tray working (M15.13). */
  slice: () => withSharedTrays(toPictureBoard(moonlitHat())),
  parking,
  purple12,
  /** The wax-seal tutorial (M13.4). */
  seals: sealsIntro,
  moon: demoMoon,
  /** 24×24, a mid-size picture with big squads (worst case for swarm clutter). */
  swarm: () => stripes("dev-swarm", "Swarm (dev)", 24, 4, 70),
  /** 32×32 shaded orb (~800 cubes, 24 shades): the M11.2 density test board (not shipped art). */
  dense: () => layeredOrb(32),
  /** 24×24 and 40×40 shaded orbs, to compare sizes. */
  dense24: () => layeredOrb(24),
  dense40: () => layeredOrb(40),
  /** 40×40 = 1,600 cubes and up to 36 familiars: the renderer's worst case (the board size limit). */
  big: () => stripes("dev-big", "Big 40×40 (dev)", 40, 5, 130),
};

// The tutorial levels (M14.2), reachable as `?level=tutorial-summon` and so on.
for (const t of TUTORIAL) DEV_LEVELS[t.id] = t.make;

/**
 * The tutorial level to start with (M14.2), or null for none:
 * - `?level=tutorial-<name>` is that level, and `?level=tutorial` the first one not finished yet
 *   (the first if all are): an explicit ask always gets the tutorial, even after a skip;
 * - with no `?level=` at all, a first visit starts in the tutorial unless it was skipped or finished;
 * - `?demo=` (the recorded slice demo) and every other level never get one.
 */
export function tutorialStart(
  search: string,
  chosen: string | null | undefined,
  book: TutorialBook,
): string | null {
  const params = new URLSearchParams(search);
  const name = chosen ?? params.get("level");
  if (name === "tutorial") return nextTutorial(book) ?? TUTORIAL_IDS[0]!;
  if (name !== null && TUTORIAL_IDS.includes(name)) return name;
  if (name === null && !params.has("demo") && shouldOfferTutorial(book)) return nextTutorial(book);
  return null;
}

/** Every art piece as a playable preview level (`?level=art-<piece id>`, M11.5), every tray working (M15.13). */
for (const [id, make] of Object.entries(ART_LEVELS))
  DEV_LEVELS[id] = () => withSharedTrays(toPictureBoard(make()));

/** The witch's journey (M15.13): the levels on the home screen's map, with their recorded deals. */
for (const e of JOURNEY) DEV_LEVELS[e.id] = e.make;

/** With no level asked for, the journey's first. */
export const DEFAULT_DEV_LEVEL = JOURNEY[0]!.id;

/** One level in the order the home screen offers them (M15.13). */
export interface LineEntry {
  /** The registry name that loads it. */
  key: string;
  /** The level's id (the pouch records first clears by it). */
  id: string;
  name: string;
  tier: Tier;
  chapter: number;
  chapterName: string;
  /** Hard or Extreme (shown on its stop), or null for an easy or medium level. */
  challenge: "hard" | "extreme" | null;
}

/** The levels in play order: the witch's journey, chapter by chapter, easy to extreme in each. */
export function levelLine(): LineEntry[] {
  return JOURNEY.map((e) => ({
    key: e.id,
    id: e.id,
    name: e.name,
    tier: e.tier,
    chapter: e.chapter,
    chapterName: e.chapterName,
    challenge: challengeOf(e.id),
  }));
}

export type LineStatus = "done" | "open" | "locked";

/**
 * Which levels are finished, which can be played and which wait: the first level is always open, and
 * each one after it opens once the one before it has been cleared. A finished level can be replayed.
 */
export function lineStatus(line: readonly LineEntry[], cleared: ReadonlySet<string>): LineStatus[] {
  return line.map((e, i) =>
    cleared.has(e.id) ? "done" : i === 0 || cleared.has(line[i - 1]!.id) ? "open" : "locked",
  );
}

/** `?level=<name>` from a URL search string, falling back to the default. */
export function levelFromSearch(search: string, chosen?: string | null): collect.CollectLevel {
  // A level picked in the game (replaying a Spellbook page) wins over the address bar.
  const name =
    (chosen && DEV_LEVELS[chosen] ? chosen : null) ??
    new URLSearchParams(search).get("level") ??
    DEFAULT_DEV_LEVEL;
  return (DEV_LEVELS[name] ?? DEV_LEVELS[DEFAULT_DEV_LEVEL]!)();
}

/**
 * `?level=daily` (or a replay choice of `"daily"`): today's daily challenge (M13.5), by the UTC date
 * of `now`. `?date=YYYY-MM-DD` picks another day, for review and for replaying a day; a bad date falls
 * back to today. Null when the level asked for is not the daily.
 */
export function dailyFromSearch(
  search: string,
  now: number,
  chosen?: string | null,
): { date: string; levelId: string } | null {
  const params = new URLSearchParams(search);
  if ((chosen ?? params.get("level")) !== "daily") return null;
  // A day picked in the address bar is for review or practice; the Spellbook's Daily button is today.
  const asked = chosen ? "" : (params.get("date") ?? "");
  const date = dayNumber(asked) !== null ? asked : utcDate(now);
  const levelId = dailyLevelId(
    date,
    JOURNEY.map((e) => e.id),
  );
  return levelId ? { date, levelId } : null;
}

/** `?demo=win|lose|deadlock`: a recorded line for the slice level (review builds), else null. */
export function demoLineFromSearch(
  search: string,
  level: collect.CollectLevel,
): readonly collect.Action[] | null {
  // The board as played is a picture board (M15.13): its winning line comes from the solver, under the
  // game's own policy (boxes that wait resume by themselves). There is no losing demo: with every tray
  // working there is no trap to show on a still board.
  if (new URLSearchParams(search).get("demo") !== "win") return null;
  return collect.solve(level, undefined, true).line;
}
