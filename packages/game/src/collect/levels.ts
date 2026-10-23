import * as collect from "@hexhue/core/collect";
import { createRng } from "@hexhue/core";

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

export const DEV_LEVELS: Record<string, () => collect.CollectLevel> = {
  parking,
  purple12,
  moon: demoMoon,
};

export const DEFAULT_DEV_LEVEL = "moon";

/** `?level=<name>` from a URL search string, falling back to the default. */
export function levelFromSearch(search: string): collect.CollectLevel {
  const name = new URLSearchParams(search).get("level") ?? DEFAULT_DEV_LEVEL;
  return (DEV_LEVELS[name] ?? DEV_LEVELS[DEFAULT_DEV_LEVEL]!)();
}
