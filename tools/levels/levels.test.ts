import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLevel, verifySolution } from "@hexhue/core";
import { worlds } from "../../content/worlds";
import { OUTPUT_DIR, sourceHash, type BuiltWorld } from "./format";

/**
 * CI gate for shipped content: every configured level is built, up to date with its source, a
 * valid level, and its stored solution actually wins.
 */
describe.each(worlds)("world $id", (world) => {
  const built = JSON.parse(
    readFileSync(new URL(`${world.id}.json`, OUTPUT_DIR), "utf8"),
  ) as BuiltWorld;

  it("contains exactly the configured levels, in order", () => {
    expect(built.levels.map((l) => l.level.id)).toEqual(world.levels.map((l) => l.id));
  });

  it.each(world.levels)("$id is up to date, valid and winnable", (config) => {
    const entry = built.levels.find((l) => l.level.id === config.id)!;
    expect(entry.source, "stale level: run `npm run levels`").toBe(sourceHash(world, config));
    const level = parseLevel(entry.level);
    expect(level.name).toBe(config.name);
    expect(verifySolution(level, entry.solution)).toBe(true);
  });

  it("has unique level ids across all worlds", () => {
    const ids = worlds.flatMap((w) => w.levels.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
