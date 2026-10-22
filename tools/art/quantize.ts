import { EMPTY, type Art } from "@hexhue/core";
import { distance, toHex, type Rgb } from "./color";

export interface ImportOptions {
  /** Source pixels per art cell (for upscaled pixel art). 0 = detect. */
  block?: number;
  /** Merge colors until at most this many remain (1..MAX_IMPORT_COLORS). */
  maxColors?: number;
  /** Alpha below this is an empty cell. */
  alphaCutoff?: number;
}

const KEYS = "abcdefghjkmnpqrstuvwxyz";
/** Legend characters `toAsciiSource` can emit, so the most colors an import may keep. */
export const MAX_IMPORT_COLORS = KEYS.length;
/** More distinct colors than this (after 4-bit bucketing) means the input isn't pixel art. */
const MAX_SOURCE_COLORS = 256;

/**
 * Detects the block size of upscaled pixel art: the GCD of all horizontal and vertical run
 * lengths of identical pixels (1 for native-resolution art). Runs touching the right or bottom
 * edge are ignored (unless they span the whole line), so a partial margin doesn't shrink the
 * block, and all fully transparent pixels count as identical whatever RGB an exporter left.
 */
export function detectBlock(rgba: Uint8Array, width: number, height: number): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const same = (i: number, j: number) =>
    (rgba[i + 3] === 0 && rgba[j + 3] === 0) ||
    (rgba[i] === rgba[j] &&
      rgba[i + 1] === rgba[j + 1] &&
      rgba[i + 2] === rgba[j + 2] &&
      rgba[i + 3] === rgba[j + 3]);
  let g = 0;
  const scan = (length: number, lines: number, at: (line: number, k: number) => number) => {
    for (let line = 0; line < lines; line++) {
      let run = 1;
      for (let k = 1; k <= length; k++) {
        if (k < length && same(at(line, k), at(line, k - 1))) run++;
        else {
          if (k < length || run === length) g = gcd(g, run);
          run = 1;
        }
      }
    }
  };
  scan(width, height, (y, x) => (y * width + x) * 4);
  scan(height, width, (x, y) => (y * width + x) * 4);
  return Math.max(1, g);
}

/**
 * Converts RGBA pixels to `Art`: samples one pixel per block, treats pixels with alpha below the
 * cutoff as empty (others keep their RGB, ignoring partial alpha), and merges the closest colors
 * (weighted by usage) until at most `maxColors` remain. Throws on input that can't be pixel art.
 */
export function quantize(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: ImportOptions = {},
): Art {
  const maxColors = options.maxColors ?? 8;
  const cutoff = options.alphaCutoff ?? 128;
  if (!Number.isInteger(maxColors) || maxColors < 1 || maxColors > MAX_IMPORT_COLORS) {
    throw new Error(`maxColors must be 1..${MAX_IMPORT_COLORS}`);
  }
  const block = options.block || detectBlock(rgba, width, height);
  if (!Number.isInteger(block) || block < 1 || block > Math.min(width, height)) {
    throw new Error(`block ${block} does not fit a ${width}×${height} image`);
  }
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

  // Too many distinct colors to merge greedily (O(n³)): bucket to 4 bits per channel first.
  const exact = new Set(pixels.flatMap((p) => (p ? [toHex(p)] : [])));
  if (exact.size > MAX_SOURCE_COLORS) {
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      if (p) pixels[i] = p.map((c) => (c & 0xf0) | 0x08) as Rgb;
    }
  }

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
  if (groups.length > MAX_SOURCE_COLORS) {
    throw new Error(
      `${groups.length} distinct colors: this looks like a photo or smooth artwork, not pixel ` +
        `art. Downscale and reduce colors in an image editor first.`,
    );
  }

  // Greedy merging of the closest pair, weighted by usage.
  while (groups.length > maxColors) {
    let best: [number, number] = [0, 1];
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
    merge(groups, best[0], best[1]);
  }
  // Centroids can round to the same hex; combine those (legends need unique colors).
  for (let a = 0; a < groups.length; a++) {
    for (let b = groups.length - 1; b > a; b--) {
      if (toHex(groups[a]!.color) === toHex(groups[b]!.color)) merge(groups, a, b);
    }
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

function merge(groups: { color: Rgb; count: number; members: string[] }[], a: number, b: number) {
  const ga = groups[a]!;
  const gb = groups[b]!;
  const n = ga.count + gb.count;
  ga.color = ga.color.map((c, k) => (c * ga.count + gb.color[k]! * gb.count) / n) as Rgb;
  ga.count = n;
  ga.members.push(...gb.members);
  groups.splice(b, 1);
}

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
