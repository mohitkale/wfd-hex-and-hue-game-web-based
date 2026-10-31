import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../packages/game/src/collect/${path}`, import.meta.url), "utf8");
const importsOf = (src: string) =>
  [...src.matchAll(/^import[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);

describe("v2 renderer boundaries", () => {
  it("swarm.ts is purely cosmetic: it imports nothing, so it cannot touch game state", () => {
    expect(importsOf(read("swarm.ts"))).toEqual([]);
  });

  it("the pure helpers (layout, clock, profile, bake-free maths) do not import Phaser or the engine", () => {
    for (const file of [
      "collectLayout.ts",
      "tickClock.ts",
      "profile.ts",
      "swarm.ts",
      "particles.ts",
    ]) {
      const imports = importsOf(read(file));
      expect(
        imports.filter((i) => i === "phaser" || i.startsWith("@hexhue/core")),
        file,
      ).toEqual([]);
    }
  });

  it("the game's entry point mounts the board directly (v2 only since M15.13; v1 is gone)", () => {
    const index = readFileSync(
      new URL("../../packages/game/src/index.ts", import.meta.url),
      "utf8",
    );
    const staticImports = importsOf(index).filter((i) => i.includes("collect"));
    expect(staticImports).toEqual(["./collect/CollectScene"]);
    expect(index).not.toMatch(/scenes\//);
  });

  it("the engine is only imported by the renderer as types or through the collect subpath", () => {
    for (const file of ["FamiliarLayer.ts", "visuals.ts"]) {
      const src = read(file);
      for (const m of src.matchAll(/^import (?!type)[^;]*from\s+["'](@hexhue\/core[^"']*)["']/gm)) {
        expect(m[1], file).toBe("@hexhue/core/collect");
      }
    }
  });
});
