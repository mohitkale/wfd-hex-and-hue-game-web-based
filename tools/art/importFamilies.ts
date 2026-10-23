import { distance, toHex, type Rgb } from "./color";
import { HOUSE_FAMILIES, ROLES, nearestHouseShade, type Role } from "./families";
import { detectBlock } from "./quantize";

/**
 * Production import (M11.4): a hand-painted PNG becomes a v2 piece by snapping every source colour
 * to the nearest house family shade (docs/ART_DIRECTION_V2.md §3), with quality controls, instead
 * of merging colours freely like the v1 import. The result is a starting point: rules, lore and a
 * human review still decide whether it ships.
 */

export interface FamilyImportOptions {
  /** Source pixels per cell; 0 = detect. */
  block?: number;
  /** Keep at most this many families (1..8); the least-used are folded into the nearest kept. */
  maxFamilies?: number;
  /** Alpha below this is an empty cell. */
  alphaCutoff?: number;
  /**
   * Quality control: the mean redmean distance from each source pixel to its assigned house shade
   * may not exceed this, or the image is not close enough to the palette (repaint or use custom
   * ramps). Default 45; the closest two house shades in a ramp are 46 apart.
   */
  maxMeanError?: number;
}

export interface FamilyImport {
  width: number;
  height: number;
  rows: string[];
  legend: Record<string, [string, Role]>;
  /** Source colour → what it became, most-used first. */
  mapping: { source: string; family: string; role: Role; error: number; pixels: number }[];
  error: { mean: number; max: number };
}

/** Legend characters, in the order they are handed out. */
const KEYS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

export function importFamilies(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: FamilyImportOptions = {},
): FamilyImport {
  const maxFamilies = options.maxFamilies ?? 8;
  const cutoff = options.alphaCutoff ?? 128;
  const maxMeanError = options.maxMeanError ?? 45;
  if (!Number.isInteger(maxFamilies) || maxFamilies < 1 || maxFamilies > 8)
    throw new Error("maxFamilies must be 1..8");
  const block = options.block || detectBlock(rgba, width, height);
  if (!Number.isInteger(block) || block < 1 || block > Math.min(width, height))
    throw new Error(`block ${block} does not fit a ${width}×${height} image`);
  const w = Math.floor(width / block);
  const h = Math.floor(height / block);

  const pixels: (Rgb | null)[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i =
        ((y * block + Math.floor(block / 2)) * width + x * block + Math.floor(block / 2)) * 4;
      pixels.push(rgba[i + 3]! < cutoff ? null : [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]);
    }
  }
  const sources = new Map<string, { rgb: Rgb; pixels: number }>();
  for (const p of pixels) {
    if (!p) continue;
    const key = toHex(p);
    const s = sources.get(key);
    if (s) s.pixels++;
    else sources.set(key, { rgb: p, pixels: 1 });
  }
  if (sources.size === 0) throw new Error("the image has no filled cells");
  if (sources.size > 256)
    throw new Error(
      `${sources.size} distinct colours: this looks like a photo or smooth artwork, not pixel art.`,
    );

  // Snap every source colour to the nearest house shade, then keep the most-used families.
  const snapped = new Map(
    [...sources].map(([hex, s]) => [hex, { ...nearestHouseShade(s.rgb), ...s }] as const),
  );
  const usage = new Map<string, number>();
  for (const s of snapped.values()) usage.set(s.family, (usage.get(s.family) ?? 0) + s.pixels);
  const kept = new Set(
    [...usage]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxFamilies)
      .map(([family]) => family),
  );
  const assign = new Map<string, { family: string; role: Role; error: number }>();
  for (const [hex, s] of snapped) {
    if (kept.has(s.family)) {
      assign.set(hex, { family: s.family, role: s.role, error: s.distance });
      continue;
    }
    let best: { family: string; role: Role; error: number } | null = null;
    for (const family of kept) {
      for (const role of ROLES) {
        const d = distance(s.rgb, parseHexRgb(HOUSE_FAMILIES[family]![role]));
        if (!best || d < best.error) best = { family, role, error: d };
      }
    }
    assign.set(hex, best!);
  }

  let sum = 0;
  let max = 0;
  let total = 0;
  for (const [hex, s] of sources) {
    const a = assign.get(hex)!;
    sum += a.error * s.pixels;
    max = Math.max(max, a.error);
    total += s.pixels;
  }
  const mean = sum / total;
  if (mean > maxMeanError) {
    throw new Error(
      `the image is too far from the house palette (mean error ${mean.toFixed(0)} > ${maxMeanError}): repaint with the family ramps, or define custom ramps`,
    );
  }

  // Characters by usage, most-used first.
  const keyOf = new Map<string, string>();
  const legend: Record<string, [string, Role]> = {};
  const used = [...sources].sort((a, b) => b[1].pixels - a[1].pixels);
  for (const [hex] of used) {
    const a = assign.get(hex)!;
    const id = `${a.family}/${a.role}`;
    if (!keyOf.has(id)) {
      const ch = KEYS[keyOf.size];
      if (!ch) throw new Error("too many distinct shades to give each a legend character");
      keyOf.set(id, ch);
      legend[ch] = [a.family, a.role];
    }
  }
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const p = pixels[y * w + x];
      if (!p) row += ".";
      else {
        const a = assign.get(toHex(p))!;
        row += keyOf.get(`${a.family}/${a.role}`);
      }
    }
    rows.push(row);
  }
  return {
    width: w,
    height: h,
    rows,
    legend,
    mapping: used.map(([hex, s]) => {
      const a = assign.get(hex)!;
      return {
        source: hex,
        family: a.family,
        role: a.role,
        error: +a.error.toFixed(1),
        pixels: s.pixels,
      };
    }),
    error: { mean: +mean.toFixed(1), max: +max.toFixed(1) },
  };
}

function parseHexRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The piece as TypeScript for `content/v2art`: unreviewed, imported, licence still pending. */
export function toPieceSource(id: string, result: FamilyImport, author: string): string {
  const legend = Object.entries(result.legend)
    .map(([ch, [family, role]]) => `    ${ch}: ["${family}", "${role}"],`)
    .join("\n");
  const rows = result.rows.map((r) => `    "${r}",`).join("\n");
  const name = id.replace(/-/g, "_").replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
  return `export const ${name}: ArtPiece = {
  id: "${id}",
  name: "TODO name",
  theme: "other",
  lore: "TODO: one line, no unsupported historical or religious claims",
  rows: [
${rows}
  ],
  legend: {
${legend}
  },
  provenance: {
    author: ${JSON.stringify(author)},
    source: "imported-png",
    licence: "original-owner-pending",
    reviewed: false,
  },
};
`;
}
