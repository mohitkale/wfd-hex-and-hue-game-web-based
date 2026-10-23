import * as collect from "@hexhue/core/collect";
import { createRng } from "@hexhue/core";
import { ART_LEVELS } from "./artLevels";
import { layeredOrb } from "./denseBoard";
import { LOSE_LINES, SLICE_ID, WIN_LINE, moonlitHat } from "./slice";

/**
 * Levels for the `?engine=v2` review build. The vertical-slice level (M10.5) replaces `demo` as the
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
  /** The M10.5 vertical slice (gate G1). */
  slice: moonlitHat,
  parking,
  purple12,
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

/** Every art piece as a playable preview level (`?level=art-<piece id>`, M11.5). */
Object.assign(DEV_LEVELS, ART_LEVELS);

export const DEFAULT_DEV_LEVEL = "slice";

/** `?level=<name>` from a URL search string, falling back to the default. */
export function levelFromSearch(search: string): collect.CollectLevel {
  const name = new URLSearchParams(search).get("level") ?? DEFAULT_DEV_LEVEL;
  return (DEV_LEVELS[name] ?? DEV_LEVELS[DEFAULT_DEV_LEVEL]!)();
}

/** `?demo=win|lose|deadlock`: a recorded line for the slice level (review builds), else null. */
export function demoLineFromSearch(
  search: string,
  level: collect.CollectLevel,
): readonly collect.Action[] | null {
  if (level.id !== SLICE_ID) return null;
  const demo = new URLSearchParams(search).get("demo");
  if (demo === "win") return WIN_LINE;
  if (demo === "lose" || demo === "slots") return LOSE_LINES.slots;
  if (demo === "deadlock") return LOSE_LINES.deadlock;
  return null;
}
