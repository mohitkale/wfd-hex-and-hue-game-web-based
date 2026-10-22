import { describe, expect, it } from "vitest";
import type { BuiltWorld } from "@hexhue/core";
import { flatLevels, gatingLevel, isUnlocked, nextLevel, worldProgress } from "./progress";

const world = (id: string, n: number) =>
  ({
    id,
    name: id,
    levels: Array.from({ length: n }, (_, i) => ({ level: { id: `${id}-${i + 1}` } })),
  }) as unknown as BuiltWorld;
const worlds = [world("a", 3), world("b", 2)];
const save = (levels: Record<string, number> = {}, skipped: string[] = []) => ({
  levels: Object.fromEntries(Object.entries(levels).map(([id, stars]) => [id, { stars, wins: 1 }])),
  skipped,
});

describe("progress", () => {
  it("lists levels in play order across worlds", () => {
    expect(flatLevels(worlds).map((r) => r.id)).toEqual(["a-1", "a-2", "a-3", "b-1", "b-2"]);
  });

  it("unlocks the first level and each level after a completed or skipped one", () => {
    const s = save({ "a-1": 3 }, ["a-2"]);
    expect(isUnlocked(worlds, s, 0, 0)).toBe(true);
    expect(isUnlocked(worlds, s, 0, 1)).toBe(true);
    expect(isUnlocked(worlds, s, 0, 2)).toBe(true); // a-2 skipped
    expect(isUnlocked(worlds, s, 1, 0)).toBe(false);
    expect(isUnlocked(worlds, s, 9, 9)).toBe(false);
  });

  it("crosses into the next world after the last level of the previous one", () => {
    expect(isUnlocked(worlds, save({ "a-1": 1, "a-2": 1, "a-3": 2 }), 1, 0)).toBe(true);
  });

  it("the frontier is the first level not yet passed; skips don't hold it back", () => {
    expect(nextLevel(worlds, save())).toEqual({ world: 0, level: 0, id: "a-1" });
    expect(nextLevel(worlds, save({ "a-1": 3 }))?.id).toBe("a-2");
    // Skip a-2, then win a-3: the frontier moves on to the next world.
    expect(nextLevel(worlds, save({ "a-1": 3, "a-3": 2 }, ["a-2"]))?.id).toBe("b-1");
    expect(
      nextLevel(worlds, save({ "a-1": 3, "a-2": 1, "a-3": 1, "b-1": 1, "b-2": 1 })),
    ).toBeNull();
  });

  it("a level both skipped and later completed counts as completed", () => {
    const s = save({ "a-1": 1, "a-2": 2 }, ["a-2"]);
    expect(worldProgress(worlds[0]!, s).completed).toBe(2);
    expect(nextLevel(worlds, s)?.id).toBe("a-3");
  });

  it("names the level that gates each one, across worlds", () => {
    expect(gatingLevel(worlds, { world: 0, level: 0 })).toBeNull();
    expect(gatingLevel(worlds, { world: 1, level: 0 })?.id).toBe("a-3");
  });

  it("ignores inherited keys in progress lookups", () => {
    expect(worldProgress(world("toString", 1), save()).completed).toBe(0);
  });

  it("sums stars and completion per world", () => {
    expect(worldProgress(worlds[0]!, save({ "a-1": 3, "a-3": 2 }))).toEqual({
      stars: 5,
      maxStars: 9,
      completed: 2,
      total: 3,
    });
  });
});
