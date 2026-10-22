import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAsciiArt, parseLevel, verifySolution } from "@hexhue/core";
import { worlds } from "../../content/worlds";
import { artProblems } from "../art/check";
import { OUTPUT_DIR, sourceHash, type BuiltWorld } from "./format";

const REBUILD = "run `npm run levels` and commit the result";

/**
 * CI gate for shipped content: every configured level is built from its current config and engine,
 * matches its art and settings, carries current display text, and its stored solution wins.
 */
describe.each(worlds)("world $id", (world) => {
  const built = JSON.parse(
    readFileSync(new URL(`${world.id}.json`, OUTPUT_DIR), "utf8"),
  ) as BuiltWorld;

  it("contains exactly the configured levels, in order", () => {
    expect(
      built.levels.map((l) => l.level.id),
      REBUILD,
    ).toEqual(world.levels.map((l) => l.id));
    expect(built.name, REBUILD).toBe(world.name);
  });

  it.each(world.levels)("$id is current, faithful to its config, and winnable", (config) => {
    const entry = built.levels.find((l) => l.level.id === config.id)!;
    expect(entry.source, `stale level: ${REBUILD}`).toBe(sourceHash(world, config));
    expect(entry.level.name, REBUILD).toBe(config.name);
    expect(entry.lore, REBUILD).toBe(config.lore);

    // Guard against hand edits or bad merges of the JSON: the puzzle must match its sources.
    const level = parseLevel(entry.level);
    expect(Object.keys(entry.level).sort()).toEqual(Object.keys(level).sort());
    const art = parseAsciiArt(config.art);
    expect({
      width: level.width,
      height: level.height,
      palette: level.palette,
      cells: level.cells,
    }).toEqual(art);
    expect(level.slots).toBe(config.generate.slots);
    expect(level.trackCap).toBe(config.generate.trackCap);
    expect(level.columns.length).toBeLessThanOrEqual(config.generate.columns);
    expect(artProblems(level), "art readability (see tools/art/check.ts)").toEqual([]);

    expect(
      verifySolution(level, entry.solution),
      `stored solution no longer wins: ${REBUILD} -- --force`,
    ).toBe(true);
  });
});

describe("content", () => {
  it("has unique world and level ids", () => {
    const worldIds = worlds.map((w) => w.id);
    expect(new Set(worldIds).size).toBe(worldIds.length);
    const ids = worlds.flatMap((w) => w.levels.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no orphaned generated files", () => {
    const files = readdirSync(fileURLToPath(OUTPUT_DIR)).filter((f) => f.endsWith(".json"));
    expect(files.sort()).toEqual(worlds.map((w) => `${w.id}.json`).sort());
  });
});
