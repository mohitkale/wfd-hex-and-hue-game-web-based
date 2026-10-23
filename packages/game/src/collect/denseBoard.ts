import * as collect from "@hexhue/core/collect";
import { createRng } from "@hexhue/core";

/**
 * A dev load-test board for the denser art of M11.2 (docs/V2_ART_DENSITY.md): a lit orb of `layers`
 * colour families, outermost family first, each shaded in four steps (deep, shade, base, light)
 * from an upper-left light. It is NOT shipped art (ART_DIRECTION_V2 §6: generated shapes are
 * drafting aids). It exists to measure rendering cost, cube size and play time at 24-40 per side
 * with shades, and it is always finishable: groups are dealt outermost colour first in every
 * column, so each colour is exposed by the time its groups are the front ones.
 */

const FAMILIES = ["#e0455f", "#f6c945", "#5cbf5a", "#2fc4b2", "#4a82e8", "#9a5fe0"];
const DEEP = [0x1c, 0x0f, 0x3a];
const mix = (hex: string, target: number[], t: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c, i) => c + (target[i]! - c) * t);
  return "#" + ch.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
};
/** deep, shade, base, light: the same mixes as the house ramps (ART_DIRECTION_V2 §3). */
const ramp = (base: string): string[] => [
  mix(base, DEEP, 0.5),
  mix(base, DEEP, 0.28),
  base,
  mix(base, [255, 255, 255], 0.35),
];

export function layeredOrb(
  size: number,
  layers = 6,
  chunk = 40,
  opts: Partial<collect.CollectLevel> = {},
): collect.CollectLevel {
  const palette = FAMILIES.slice(0, layers);
  const colors = palette.flatMap(ramp);
  const family = palette.flatMap((_, f) => [f, f, f, f]);
  const radius = size / 2;
  const cells: number[] = [];
  const looks: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - radius) / radius;
      const dy = (y + 0.5 - radius) / radius;
      const r = Math.hypot(dx, dy);
      if (r > 0.98) {
        cells.push(-1);
        looks.push(-1);
        continue;
      }
      // Layer 0 is the outer ring, the last layer the core.
      const layer = Math.min(layers - 1, Math.floor(((0.98 - r) / 0.98) * layers));
      // Light from the upper left, per ring: the side of the ring facing the light is lighter.
      const facing = r < 1e-6 ? 0 : (-dx - dy) / (r * Math.SQRT2);
      const lit = 0.5 + 0.5 * facing * Math.min(1, r / 0.08);
      const shade = lit < 0.2 ? 0 : lit < 0.45 ? 1 : lit < 0.75 ? 2 : 3;
      cells.push(layer);
      looks.push(layer * 4 + shade);
    }
  }
  const counts = new Array<number>(layers).fill(0);
  for (const c of cells) if (c >= 0) counts[c]!++;
  const rng = createRng(11);
  const groups: collect.GroupSpec[][] = [];
  counts.forEach((n, color) => {
    const list: collect.GroupSpec[] = [];
    let left = n;
    while (left > 0) {
      const take =
        left <= chunk * 1.5 ? left : rng.int(Math.round(chunk * 0.7), Math.round(chunk * 1.3));
      list.push({ color, capacity: take });
      left -= take;
    }
    groups.push(list);
  });
  const columns: collect.GroupSpec[][] = [[], [], [], []];
  // Outermost colour first, dealt round-robin: every column is in outside-in order.
  groups.flat().forEach((g, i) => columns[i % columns.length]!.push(g));
  return {
    id: `dev-orb-${size}`,
    name: `Orb ${size}×${size} (dev)`,
    width: size,
    height: size,
    palette,
    cells,
    columns,
    slots: 4,
    squad: 5,
    spawnGap: 1,
    fieldCap: 4,
    shades: { colors, family, cells: looks },
    ...opts,
  };
}
