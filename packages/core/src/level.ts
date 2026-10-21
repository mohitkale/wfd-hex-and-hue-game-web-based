/** Marks an empty mosaic cell. */
export const EMPTY = -1;

/** A wisp as authored in a level: its palette color and how many fragments it collects. */
export interface WispSpec {
  color: number;
  charge: number;
}

/**
 * A playable level. `cells` is row-major (`index = y * width + x`, y = 0 is the top row) holding a
 * palette index or `EMPTY`. `columns[c][0]` is the front (tappable) wisp of column `c`.
 */
export interface Level {
  id: string;
  name: string;
  width: number;
  height: number;
  /** `#rrggbb` colors; cell and wisp colors index into this. */
  palette: string[];
  cells: number[];
  columns: WispSpec[][];
  /** Holding slots (K). */
  slots: number;
  /** Max wisps on the track at once (T). */
  trackCap: number;
}

export const LEVEL_LIMITS = {
  maxSize: 64,
  maxColors: 16,
  maxColumns: 6,
  maxSlots: 8,
  maxTrackCap: 10,
} as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Number of fragments of each palette color in the mosaic. */
export function countFragments(level: Pick<Level, "palette" | "cells">): number[] {
  const counts = new Array<number>(level.palette.length).fill(0);
  for (const c of level.cells) {
    if (c !== EMPTY && c >= 0 && c < counts.length) counts[c] = (counts[c] ?? 0) + 1;
  }
  return counts;
}

/** Sum of wisp charges per palette color. */
export function countCharges(level: Pick<Level, "palette" | "columns">): number[] {
  const counts = new Array<number>(level.palette.length).fill(0);
  for (const column of level.columns) {
    for (const w of column) {
      if (w.color >= 0 && w.color < counts.length)
        counts[w.color] = (counts[w.color] ?? 0) + w.charge;
    }
  }
  return counts;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/**
 * Checks every rule a level must satisfy, including the core invariant that for each color the
 * wisp charges add up to exactly the number of fragments. Returns human-readable errors; an empty
 * array means the level is valid.
 */
export function validateLevel(level: Level): string[] {
  const errors: string[] = [];
  const { width, height, palette, cells, columns, slots, trackCap } = level;
  const L = LEVEL_LIMITS;

  if (!level.id) errors.push("id is required");
  if (!isInt(width) || width < 1 || width > L.maxSize) errors.push(`width must be 1..${L.maxSize}`);
  if (!isInt(height) || height < 1 || height > L.maxSize)
    errors.push(`height must be 1..${L.maxSize}`);
  if (palette.length < 1 || palette.length > L.maxColors)
    errors.push(`palette must have 1..${L.maxColors} colors`);
  palette.forEach((p, i) => {
    if (!HEX_COLOR.test(p)) errors.push(`palette[${i}] "${p}" is not #rrggbb`);
  });
  if (!isInt(slots) || slots < 1 || slots > L.maxSlots)
    errors.push(`slots must be 1..${L.maxSlots}`);
  if (!isInt(trackCap) || trackCap < 1 || trackCap > L.maxTrackCap)
    errors.push(`trackCap must be 1..${L.maxTrackCap}`);

  if (cells.length !== width * height) {
    errors.push(`cells has ${cells.length} entries, expected ${width * height}`);
  }
  cells.forEach((c, i) => {
    if (!isInt(c) || c < EMPTY || c >= palette.length)
      errors.push(`cells[${i}] = ${c} is not EMPTY or a palette index`);
  });
  if (!cells.some((c) => c !== EMPTY)) errors.push("mosaic has no fragments");

  if (columns.length < 1 || columns.length > L.maxColumns)
    errors.push(`columns must have 1..${L.maxColumns} entries`);
  columns.forEach((column, ci) => {
    if (column.length === 0) errors.push(`columns[${ci}] is empty`);
    column.forEach((w, wi) => {
      if (!isInt(w.color) || w.color < 0 || w.color >= palette.length)
        errors.push(`columns[${ci}][${wi}].color ${w.color} is not a palette index`);
      if (!isInt(w.charge) || w.charge < 1)
        errors.push(`columns[${ci}][${wi}].charge must be a positive integer`);
    });
  });

  if (errors.length === 0) {
    const fragments = countFragments(level);
    const charges = countCharges(level);
    palette.forEach((_, color) => {
      if (fragments[color] !== charges[color]) {
        errors.push(
          `color ${color}: wisp charges total ${charges[color]} but mosaic has ${fragments[color]} fragments`,
        );
      }
    });
  }
  return errors;
}

/**
 * Parses untrusted JSON (e.g. a fetched level file) into a `Level`, checking its shape and then
 * every rule in `validateLevel`. Throws with all problems listed.
 */
export function parseLevel(json: unknown): Level {
  const fail = (msg: string): never => {
    throw new Error(`Invalid level: ${msg}`);
  };
  if (typeof json !== "object" || json === null) fail("not an object");
  const o = json as Record<string, unknown>;
  const str = (k: string) =>
    typeof o[k] === "string" ? (o[k] as string) : fail(`${k} must be a string`);
  const num = (k: string) =>
    typeof o[k] === "number" ? (o[k] as number) : fail(`${k} must be a number`);
  const arr = (k: string) =>
    Array.isArray(o[k]) ? (o[k] as unknown[]) : fail(`${k} must be an array`);

  const palette = arr("palette").map((p, i) =>
    typeof p === "string" ? p : fail(`palette[${i}] must be a string`),
  );
  const cells = arr("cells").map((c, i) =>
    typeof c === "number" ? c : fail(`cells[${i}] must be a number`),
  );
  const columns = arr("columns").map((col, ci) =>
    Array.isArray(col)
      ? col.map((w: unknown, wi): WispSpec => {
          const ww = w as Record<string, unknown> | null;
          if (!ww || typeof ww.color !== "number" || typeof ww.charge !== "number")
            fail(`columns[${ci}][${wi}] must be {color, charge}`);
          return { color: ww!.color as number, charge: ww!.charge as number };
        })
      : fail(`columns[${ci}] must be an array`),
  );

  const level: Level = {
    id: str("id"),
    name: str("name"),
    width: num("width"),
    height: num("height"),
    palette,
    cells,
    columns,
    slots: num("slots"),
    trackCap: num("trackCap"),
  };
  const errors = validateLevel(level);
  if (errors.length > 0) fail(errors.join("; "));
  return level;
}
