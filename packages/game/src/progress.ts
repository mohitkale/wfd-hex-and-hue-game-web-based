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
  id in save.levels;

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

/** The level the player should play next: the first unlocked one not yet completed. */
export function nextLevel(
  worlds: readonly BuiltWorld[],
  save: Pick<SaveData, "levels" | "skipped">,
): LevelRef | null {
  const all = flatLevels(worlds);
  for (let i = 0; i < all.length; i++) {
    const ref = all[i]!;
    const unlocked = i === 0 || isPassed(save, all[i - 1]!.id);
    if (!unlocked) return null;
    if (!isCompleted(save, ref.id)) return ref;
  }
  return null;
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
    const p = save.levels[b.level.id];
    if (p) {
      stars += p.stars;
      completed++;
    }
  }
  return { stars, maxStars: world.levels.length * 3, completed, total: world.levels.length };
}
