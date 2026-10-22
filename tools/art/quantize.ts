import { EMPTY, type Art } from "@hexhue/core";
import { distance, toHex, type Rgb } from "./color";

export interface ImportOptions {
  /** Source pixels per art cell (for upscaled pixel art). 0 = detect. */
  block?: number;
  /** Merge colors until at most this many remain. */
  maxColors?: number;
  /** Alpha below this is an empty cell. */
  alphaCutoff?: number;
}

/**
 * Detects the block size of upscaled pixel art: the GCD of all horizontal and vertical run
 * lengths of identical pixels (1 for native-resolution art).
 */
export function detectBlock(rgba: Uint8Array, width: number, height: number): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const same = (i: number, j: number) =>
    rgba[i] === rgba[j] &&
    rgba[i + 1] === rgba[j + 1] &&
    rgba[i + 2] === rgba[j + 2] &&
    rgba[i + 3] === rgba[j + 3];
  let g = 0;
  for (let y = 0; y < height; y++) {
    let run = 1;
    for (let x = 1; x <= width; x++) {
      if (x < width && same((y * width + x) * 4, (y * width + x - 1) * 4)) run++;
      else {
        g = gcd(g, run);
        run = 1;
      }
    }
  }
  for (let x = 0; x < width; x++) {
    let run = 1;
    for (let y = 1; y <= height; y++) {
      if (y < height && same((y * width + x) * 4, ((y - 1) * width + x) * 4)) run++;
      else {
        g = gcd(g, run);
        run = 1;
      }
    }
  }
  return Math.max(1, g);
}

/**
 * Converts RGBA pixels to `Art`: samples one pixel per block, treats transparent pixels as empty,
 * and merges the closest colors (weighted by usage) until at most `maxColors` remain.
 */
export function quantize(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: ImportOptions = {},
): Art {
  const block = options.block || detectBlock(rgba, width, height);
  const maxColors = options.maxColors ?? 8;
  const cutoff = options.alphaCutoff ?? 128;
  const w = Math.floor(width / block);
  const h = Math.floor(height / block);

  const pixels: (Rgb | null)[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x * block + Math.floor(block / 2);
      const sy = y * block + Math.floor(block / 2);
      const i = (sy * width + sx) * 4;
      pixels.push(rgba[i + 3]! < cutoff ? null : [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]);
    }
  }

  // Unique colors with counts, then greedy merging of the closest pair.
  const groups: { color: Rgb; count: number; members: string[] }[] = [];
  const index = new Map<string, number>();
  for (const p of pixels) {
    if (!p) continue;
    const key = toHex(p);
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, groups.length);
      groups.push({ color: p, count: 1, members: [key] });
    } else groups[at]!.count++;
  }
  while (groups.length > maxColors) {
    let best = [0, 1];
    let bestD = Infinity;
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const d = distance(groups[a]!.color, groups[b]!.color);
        if (d < bestD) {
          bestD = d;
          best = [a, b];
        }
      }
    }
    const [a, b] = best as [number, number];
    const ga = groups[a]!;
    const gb = groups[b]!;
    const n = ga.count + gb.count;
    ga.color = ga.color.map((c, k) => (c * ga.count + gb.color[k]! * gb.count) / n) as Rgb;
    ga.count = n;
    ga.members.push(...gb.members);
    groups.splice(b, 1);
  }
  // Most-used color first, like hand-authored legends.
  groups.sort((x, y) => y.count - x.count);
  const lookup = new Map<string, number>();
  groups.forEach((g, i) => g.members.forEach((m) => lookup.set(m, i)));

  return {
    width: w,
    height: h,
    palette: groups.map((g) => toHex(g.color)),
    cells: pixels.map((p) => (p ? lookup.get(toHex(p))! : EMPTY)),
  };
}

const KEYS = "abcdefghjkmnpqrstuvwxyz";

/** Renders art as an `AsciiArt` TypeScript snippet for content/art files. */
export function toAsciiSource(name: string, art: Art): string {
  const legend = art.palette.map((hex, i) => `${KEYS[i]}: "${hex}"`).join(", ");
  const rows: string[] = [];
  for (let y = 0; y < art.height; y++) {
    let row = "";
    for (let x = 0; x < art.width; x++) {
      const c = art.cells[y * art.width + x]!;
      row += c === EMPTY ? "." : KEYS[c];
    }
    rows.push(`    "${row}",`);
  }
  return `export const ${name}: AsciiArt = {\n  legend: { ${legend} },\n  rows: [\n${rows.join("\n")}\n  ],\n};\n`;
}
