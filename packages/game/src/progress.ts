import type { BuiltWorld } from "@hexhue/core";
import type { SaveData } from "./save/schema";

export interface LevelRef {
  world: number;
  level: number;
  id: string;
}

/** Every level in play order. */
export function flatLevels(worlds: readonly BuiltWorld[]): LevelRef[] {
  return worlds.flatMap((w, world) =>
    w.levels.map((b, level) => ({ world, level, id: b.level.id })),
  );
}

export const isCompleted = (save: Pick<SaveData, "levels">, id: string): boolean =>
  Object.hasOwn(save.levels, id);

/** Completed or skipped: either way the path continues past it. */
export const isPassed = (save: Pick<SaveData, "levels" | "skipped">, id: string): boolean =>
  isCompleted(save, id) || save.skipped.includes(id);

/**
 * Levels unlock in order: the first is always open, every other opens once the one before it is
 * completed or skipped. (Skipping is always offered after a few losses, so nobody is ever stuck.)
 */
export function isUnlocked(
  worlds: readonly BuiltWorld[],
  save: Pick<SaveData, "levels" | "skipped">,
  world: number,
  level: number,
): boolean {
  const all = flatLevels(worlds);
  const i = all.findIndex((r) => r.world === world && r.level === level);
  if (i <= 0) return i === 0;
  return isPassed(save, all[i - 1]!.id);
}

/**
 * The frontier: the first level not yet passed (completed or skipped). This is where the map
 * focuses and what glows; skipped levels behind it stay replayable without nagging.
 */
export function nextLevel(
  worlds: readonly BuiltWorld[],
  save: Pick<SaveData, "levels" | "skipped">,
): LevelRef | null {
  return flatLevels(worlds).find((r) => !isPassed(save, r.id)) ?? null;
}

/** The level whose completion (or skip) opens `ref`; `null` for the very first level. */
export function gatingLevel(
  worlds: readonly BuiltWorld[],
  ref: Omit<LevelRef, "id">,
): LevelRef | null {
  const all = flatLevels(worlds);
  const i = all.findIndex((r) => r.world === ref.world && r.level === ref.level);
  return i > 0 ? all[i - 1]! : null;
}

export interface WorldProgress {
  stars: number;
  maxStars: number;
  completed: number;
  total: number;
}

export function worldProgress(world: BuiltWorld, save: Pick<SaveData, "levels">): WorldProgress {
  let stars = 0;
  let completed = 0;
  for (const b of world.levels) {
    const p = Object.hasOwn(save.levels, b.level.id) ? save.levels[b.level.id] : undefined;
    if (p) {
      stars += p.stars;
      completed++;
    }
  }
  return { stars, maxStars: world.levels.length * 3, completed, total: world.levels.length };
}
