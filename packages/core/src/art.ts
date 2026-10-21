import { EMPTY } from "./level";
import type { Art } from "./generator";

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

export function parseAsciiArt(ascii: AsciiArt): Art {
  const { legend, rows } = ascii;
  if (rows.length === 0) throw new Error("art has no rows");
  const width = rows[0]!.length;
  rows.forEach((row, y) => {
    if (row.length !== width)
      throw new Error(`row ${y} has ${row.length} cells, expected ${width}`);
  });
  for (const key of Object.keys(legend)) {
    if (key.length !== 1 || EMPTY_CHARS.has(key)) throw new Error(`invalid legend key "${key}"`);
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
