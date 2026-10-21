import { readFileSync } from "node:fs";
import type { BuiltLevel, BuiltWorld } from "@hexhue/core";
import type { LevelConfig, WorldConfig } from "../../content/worlds";

export type { BuiltLevel, BuiltWorld };

/** FNV-1a 32-bit, hex. Stable across platforms; guards against accidental staleness only. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Engine sources whose behaviour shapes generated levels. Any edit to them changes every level's
 * source hash, so CI asks for `npm run levels` instead of silently keeping levels built by older
 * rules. (Output is deterministic, so a comment-only edit just rebuilds identical puzzles.)
 */
const ENGINE_FILES = ["level", "track", "sim", "rng", "solver", "generator", "art"];
const engineHash = hash(
  ENGINE_FILES.map((f) =>
    readFileSync(new URL(`../../packages/core/src/${f}.ts`, import.meta.url), "utf8"),
  ).join("\n"),
);

/** Name and lore are display text: changing them never requires regenerating the puzzle. */
export function sourceHash(world: WorldConfig, config: LevelConfig): string {
  const { name: _name, lore: _lore, ...puzzle } = config;
  return hash(JSON.stringify({ engine: engineHash, world: world.id, ...puzzle }));
}

export const OUTPUT_DIR = new URL("../../packages/game/src/levels/generated/", import.meta.url);
