import { EMPTY } from "../cells";
import { createRng } from "../rng";
import type { CollectLevel, GroupSpec } from "./level";

/** Distinct, valid palette colours for test boards. */
const PALETTE = [
  "#e24a4a",
  "#4ae26b",
  "#4a6be2",
  "#e2c84a",
  "#b44ae2",
  "#4ae2d8",
  "#e27f4a",
  "#e24a9b",
];

export interface BoardOptions {
  /** One character per colour; a board character equal to `colors[i]` is a cube of colour `i`. */
  colors: string;
  slots?: number;
  squad?: number;
  spawnGap?: number;
  fieldCap?: number;
  portalX?: number;
}

/**
 * Builds a level from ASCII rows (`.` is an open cell) and columns of `[colour char, capacity]`
 * groups, e.g. `[["R", 2]]`. Defaults: 5 slots, squad 3, spawnGap 2, fieldCap 3.
 */
export function board(
  rows: string[],
  columns: [string, number][][],
  opts: BoardOptions,
): CollectLevel {
  const width = rows[0]!.length;
  const cells: number[] = [];
  for (const row of rows) {
    if (row.length !== width) throw new Error("ragged board");
    for (const ch of row) cells.push(ch === "." ? EMPTY : opts.colors.indexOf(ch));
  }
  if (cells.some((c, i) => c === -1 && rows.join("")[i] !== ".")) throw new Error("unknown colour");
  const groupSpecs: GroupSpec[][] = columns.map((col) =>
    col.map(([ch, capacity]) => ({ color: opts.colors.indexOf(ch), capacity })),
  );
  const level: CollectLevel = {
    id: "test",
    name: "test",
    width,
    height: rows.length,
    palette: PALETTE.slice(0, opts.colors.length),
    cells,
    columns: groupSpecs,
    slots: opts.slots ?? 5,
    squad: opts.squad ?? 3,
    spawnGap: opts.spawnGap ?? 2,
    fieldCap: opts.fieldCap ?? 3,
  };
  if (opts.portalX !== undefined) level.portalX = opts.portalX;
  return level;
}

/** GAME_DESIGN_V2 §14 fixture A: one familiar, tick by tick. */
export const fixtureA = () =>
  board(["RRR"], [[["R", 2]], [["R", 1]]], { colors: "R", slots: 2, squad: 1, spawnGap: 1 });

/** Fixture B: parking, resume, overflow. */
export const fixtureB = () =>
  board(["BBBBB", "BRBGB", "BBBBB", "BRBGB"], [[["R", 2]], [["G", 2]], [["B", 16]]], {
    colors: "BRG",
    slots: 1,
    squad: 3,
    spawnGap: 2,
    fieldCap: 3,
  });

/** Fixture C: capacity binding. */
export const fixtureC = (squad = 1) =>
  board(["PPPPP"], [[["P", 3]], [["P", 2]]], { colors: "P", slots: 2, squad, spawnGap: 1 });

/** Fixture D: a sealed pocket and an illegal tap. */
export const fixtureD = () =>
  board(["XXXXX", "X.Y.X", "XXXXX"], [[["Y", 1]], [["X", 12]]], { colors: "XY", slots: 1 });

/** Fixture E: two groups of one colour, one accessible cube. */
export const fixtureE = () =>
  board(["BBB", "BRB", "BRB"], [[["R", 1]], [["R", 1]], [["B", 7]]], {
    colors: "BR",
    slots: 1,
    squad: 3,
    spawnGap: 2,
  });

/**
 * A pseudo-random valid level for property tests (`tight`: dense three-colour boards in concentric rings,
 * big groups and one slot, so parking and both kinds of loss are common): 3–8 cells each way, up to 3 colours with groups
 * that partition each colour's cube count, a few columns. Returns null if the draw has no legal
 * first action (the caller skips it).
 */
export function randomLevel(seed: number, tight = false): CollectLevel | null {
  const rng = createRng(seed);
  const width = rng.int(tight ? 5 : 3, 8);
  const height = rng.int(tight ? 5 : 3, 8);
  const colors = tight ? 3 : rng.int(1, 3);
  const cells: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rng.next() < (tight ? 0.03 : 0.18)) cells.push(EMPTY);
      else if (tight && rng.next() > 0.12) {
        // Concentric rings: inner colours are buried under outer ones.
        const depth = Math.min(x, y, width - 1 - x, height - 1 - y);
        cells.push(depth % colors);
      } else cells.push(rng.int(0, colors - 1));
    }
  }
  const counts = new Array<number>(colors).fill(0);
  for (const c of cells) if (c !== EMPTY) counts[c]!++;
  const groups: GroupSpec[] = [];
  counts.forEach((n, color) => {
    let left = n;
    while (left > 0) {
      const take = tight
        ? Math.min(left, rng.int(Math.ceil(n / 2), n))
        : Math.min(left, rng.int(1, Math.max(1, Math.ceil(n / 2))));
      groups.push({ color, capacity: take });
      left -= take;
    }
  });
  if (groups.length === 0) return null;
  const columnCount = Math.min(rng.int(1, 3), groups.length);
  const columns: GroupSpec[][] = Array.from({ length: columnCount }, () => []);
  rng.shuffle(groups).forEach((g, i) => columns[i % columnCount]!.push(g));
  return {
    id: `random-${seed}`,
    name: "random",
    width,
    height,
    palette: PALETTE.slice(0, colors),
    cells,
    columns,
    slots: tight ? 1 : rng.int(1, 4),
    squad: rng.int(1, 3),
    spawnGap: rng.int(1, 3),
    fieldCap: rng.int(1, 3),
  };
}
