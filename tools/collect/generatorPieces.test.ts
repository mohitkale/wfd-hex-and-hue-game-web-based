import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { pieces } from "../../content/v2art";
import { pieceToArt } from "../art/piece";

/** M12.2 on a real picture with layers: every profile produces a level that meets its limits. */

describe("the generator on the black cat (a picture with buried colours)", () => {
  const cat = pieces.find((p) => p.id === "black-cat")!;
  const { art } = pieceToArt(cat);

  it.each(["gentle", "standard", "tight"] as const)(
    "%s: produces a solver-verified level that meets the profile, deterministically",
    (profile) => {
      const spec = collect.PROFILES[profile];
      const g = collect.generateLevel(art, "cat", cat.name, { seed: 1, profile });
      expect(g, profile).not.toBeNull();
      expect(g!.metrics.buriedColors).toBeGreaterThanOrEqual(1);
      expect(g!.metrics.randomLoss).toBeGreaterThanOrEqual(spec.minRandomLoss);
      expect(g!.metrics.parkers).toBeGreaterThanOrEqual(spec.minParkers);
      const solved = collect.solve(g!.level);
      expect(solved.status).toBe("solved");
      expect(collect.replayLine(g!.level, solved.line!).state.status).toBe("won");
      expect(collect.generateLevel(art, "cat", cat.name, { seed: 1, profile })).toEqual(g);
    },
    120_000,
  );

  it("pressure rises with the profile: random play fails more often on tighter ones", () => {
    const loss = (profile: "gentle" | "standard" | "tight") =>
      collect.generateLevel(art, "cat", cat.name, { seed: 1, profile })!.metrics.randomLoss;
    expect(loss("gentle")).toBeLessThan(loss("standard"));
    expect(loss("standard")).toBeLessThan(loss("tight"));
  }, 120_000);
});
