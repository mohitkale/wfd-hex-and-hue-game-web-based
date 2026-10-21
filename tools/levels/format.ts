import type { LaunchSource, Level } from "@hexhue/core";
import type { LevelConfig, WorldConfig } from "../../content/worlds";

/**
 * Bump when generator output changes for the same inputs (engine or generator logic), so the CI
 * check asks for a rebuild.
 */
export const GENERATOR_VERSION = "1";

export interface BuiltLevel {
  level: Level;
  lore: string;
  /** Verified sequential solution. */
  solution: LaunchSource[];
  difficulty: number;
  minSlots: number | null;
  lossRate: number;
  /** Hash of the inputs that produced this level. */
  source: string;
}

export interface BuiltWorld {
  id: string;
  name: string;
  levels: BuiltLevel[];
}

/** FNV-1a 32-bit, hex. Stable across platforms. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function sourceHash(world: WorldConfig, config: LevelConfig): string {
  return hash(
    JSON.stringify({ v: GENERATOR_VERSION, world: world.id, ...config, lore: undefined }),
  );
}

export const OUTPUT_DIR = new URL("../../packages/game/src/levels/generated/", import.meta.url);
