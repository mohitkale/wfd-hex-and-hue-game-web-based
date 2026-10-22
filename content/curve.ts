import type { AsciiArt, GenerateOptions } from "@hexhue/core";
import type { LevelConfig } from "./types";

/** Per-world difficulty range: target difficulty climbs from `from` to `to` after the openers. */
export interface WorldCurve {
  /** World number (1-based), used for seeds. */
  world: number;
  from: number;
  to: number;
  /** Fewest holding slots used late in the world. */
  minSlots: number;
  chunk: { min: number; max: number };
}

/** Levels at the start of every world that teach rather than test. */
export const OPENERS = 3;

/**
 * Generator settings for level `index` (0-based) of `count` in a world:
 * - openers: one-lap charges, little or no shuffle, few columns, roomy slots;
 * - then fixed charges with a target difficulty rising linearly, more columns, fewer slots.
 * Individual levels can override anything (e.g. a wide artwork wanting more columns).
 */
export function curveOptions(
  curve: WorldCurve,
  index: number,
  count: number,
  overrides: Partial<GenerateOptions> = {},
): GenerateOptions {
  const seed = curve.world * 1000 + index + 1;
  if (index < OPENERS) {
    return {
      seed,
      columns: index === 0 ? 2 : 3,
      slots: 5,
      trackCap: 5,
      // Fewer, fuller wisps: openers should be short.
      chunk: { min: Math.max(6, curve.chunk.max), max: curve.chunk.max * 2 },
      charges: "reach",
      shuffle: [0, 0.2, 0.35][index]!,
      ...overrides,
    };
  }
  const t = (index - OPENERS) / Math.max(1, count - OPENERS - 1);
  const slots = t < 0.35 ? 5 : t < 0.8 ? Math.max(curve.minSlots, 4) : curve.minSlots;
  return {
    seed,
    columns: t < 0.5 ? 3 : 4,
    slots,
    trackCap: 5,
    chunk: curve.chunk,
    charges: "fixed",
    shuffle: 0.5,
    targetDifficulty: Math.round((curve.from + (curve.to - curve.from) * t) * 100) / 100,
    ...overrides,
  };
}

/** Builds a world's level list from `[name, lore, art, overrides?]` entries, in order. */
export function worldLevels(
  prefix: string,
  curve: WorldCurve,
  entries: [name: string, lore: string, art: AsciiArt, overrides?: Partial<GenerateOptions>][],
): LevelConfig[] {
  return entries.map(([name, lore, art, overrides], i) => ({
    id: `${prefix}-${String(i + 1).padStart(2, "0")}`,
    name,
    lore,
    art,
    generate: curveOptions(curve, i, entries.length, overrides),
  }));
}
