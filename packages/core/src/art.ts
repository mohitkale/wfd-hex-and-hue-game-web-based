import { EMPTY } from "./cells";

/** A picture: its size, its colours and every cell's colour index (or `EMPTY`), row by row. */
export interface Art {
  width: number;
  height: number;
  palette: string[];
  /** Row-major palette indices or `EMPTY`. */
  cells: number[];
}

/**
 * Hand-authored pixel art: each character in `rows` is one cell. `.` and space are empty; every
 * other character must be a key of `legend`, which maps it to a `#rrggbb` color. Palette order
 * follows the legend, skipping colors the rows never use.
 */
export interface AsciiArt {
  legend: Record<string, string>;
  rows: string[];
}

const EMPTY_CHARS = new Set([".", " "]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function parseAsciiArt(ascii: AsciiArt): Art {
  const { legend, rows } = ascii;
  if (rows.length === 0) throw new Error("art has no rows");
  const width = rows[0]!.length;
  rows.forEach((row, y) => {
    if (row.length !== width)
      throw new Error(`row ${y} has ${row.length} cells, expected ${width}`);
  });
  const seen = new Map<string, string>();
  for (const [key, color] of Object.entries(legend)) {
    if (key.length !== 1 || EMPTY_CHARS.has(key)) throw new Error(`invalid legend key "${key}"`);
    if (!HEX_COLOR.test(color)) throw new Error(`legend "${key}" color "${color}" is not #rrggbb`);
    const dup = seen.get(color.toLowerCase());
    if (dup) throw new Error(`legend "${key}" repeats the color of "${dup}"`);
    seen.set(color.toLowerCase(), key);
  }

  const used = new Set<string>();
  for (const row of rows) {
    for (const ch of row) {
      if (EMPTY_CHARS.has(ch)) continue;
      if (!(ch in legend)) throw new Error(`character "${ch}" is not in the legend`);
      used.add(ch);
    }
  }
  const keys = Object.keys(legend).filter((k) => used.has(k));
  const index = new Map(keys.map((k, i) => [k, i]));
  const cells: number[] = [];
  for (const row of rows) for (const ch of row) cells.push(index.get(ch) ?? EMPTY);
  return { width, height: rows.length, palette: keys.map((k) => legend[k]!), cells };
}
