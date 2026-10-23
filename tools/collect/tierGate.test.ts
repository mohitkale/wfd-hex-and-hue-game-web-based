import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { checkStrategies, tiersSatisfied } from "../../content/difficulty";
import { pieces } from "../../content/v2art";
import { moonlitHat } from "../../packages/game/src/collect/slice";
import { pieceToArt } from "../art/piece";
import { generateForTier, gateFor } from "./tierGate";
import { rows, table } from "./strategyReport";

/** M12.3: simulated players, per-strategy reports, and the tier gate the level pipeline enforces. */

const rings = (size: number): collect.GeneratorArt => ({
  width: size,
  height: size,
  palette: ["#e24a4a", "#4ae26b", "#4a6be2"],
  cells: Array.from({ length: size * size }, (_, i) => {
    const x = i % size;
    const y = Math.floor(i / size);
    return Math.min(x, y, size - 1 - x, size - 1 - y) % 3;
  }),
});

describe("the gate", () => {
  it("rejects a level that column-spam wins for medium and hard, and accepts it for tutorial", () => {
    // An open picture dealt so every cheap player wins.
    const g = collect.generateLevel(rings(10), "r", "r", {
      seed: 1,
      profile: "gentle",
      refineSteps: 0,
    })!;
    const report = collect.strategyReport(g.level);
    expect(report.wins["first-front"]).toBe(true);
    expect(gateFor("tutorial")(g.level)).toEqual([]);
    for (const tier of ["medium", "hard"] as const) {
      expect(gateFor(tier)(g.level).join(), tier).toContain("first-front must lose");
    }
  });

  it("the hand-designed slice satisfies the medium and hard player rules (no cheap player beats it)", () => {
    const report = collect.strategyReport(moonlitHat());
    expect(report.simpleWins).toBe(0);
    expect(tiersSatisfied(report)).toEqual(["medium", "hard"]);
  });

  it("is not about the solver: a level a human can win but no cheap player can is accepted for hard", () => {
    const slice = moonlitHat();
    expect(collect.solve(slice).status).toBe("solved");
    expect(checkStrategies(collect.strategyReport(slice), "hard")).toEqual([]);
  });
});

describe("generation through the gate", () => {
  it("never returns a level the gate rejects: a gate that always objects gives null, one that always accepts gives a level", () => {
    const art = rings(10);
    expect(
      collect.generateLevel(art, "r", "r", { seed: 1, profile: "gentle", gate: () => ["no"] }),
    ).toBeNull();
    expect(
      collect.generateLevel(art, "r", "r", { seed: 1, profile: "gentle", gate: () => [] }),
    ).not.toBeNull();
  });

  it("a tutorial level generated for a picture passes the tutorial rules and is solver-verified", () => {
    const g = generateForTier(rings(10), "r", "r", "tutorial")!;
    expect(g).not.toBeNull();
    expect(gateFor("tutorial")(g.level)).toEqual([]);
    expect(collect.solve(g.level).status).toBe("solved");
  });

  it("the black cat can be generated for easy: cheap play wins some but not all of it", () => {
    const cat = pieces.find((p) => p.id === "black-cat")!;
    const g = generateForTier(pieceToArt(cat).art, "cat", cat.name, "easy")!;
    expect(g).not.toBeNull();
    const report = collect.strategyReport(g.level);
    expect(checkStrategies(report, "easy")).toEqual([]);
    expect(report.simpleWins).toBeLessThanOrEqual(7);
    expect(report.randomRate).toBeGreaterThanOrEqual(0.4);
    expect(collect.solve(g.level).status).toBe("solved");
  }, 180_000);

  it("a picture that cannot support a tier gets no level rather than a trivial one (the cauldron for medium)", () => {
    const cauldron = pieces.find((p) => p.id === "witchs-cauldron")!;
    const { art } = pieceToArt(cauldron);
    // A reduced search keeps this quick; the full search (docs/V2_STRATEGIES.md) also finds nothing.
    const g = collect.generateLevel(art, "c", "c", {
      seed: 1,
      profile: "standard",
      maxAttempts: 4,
      refineSteps: 4,
      gate: gateFor("medium"),
    });
    expect(g).toBeNull();
  }, 180_000);
});

describe("the strategy report over the real levels", () => {
  const rs = rows();

  it("covers the slice and every art level, with a verdict per player", () => {
    expect(rs.map((r) => r.id)).toEqual(["slice-moonlit-hat", ...pieces.map((p) => `art-${p.id}`)]);
    for (const r of rs) {
      expect(Object.keys(r.report.wins)).toEqual([...collect.DETERMINISTIC_PLAYERS]);
      expect(r.report.randomRate).toBeGreaterThanOrEqual(0);
      expect(r.report.randomRate).toBeLessThanOrEqual(1);
    }
  });

  it("prints a table with one row per level", () => {
    const lines = table(rs).split("\n");
    expect(lines).toHaveLength(rs.length + 1);
    expect(lines[0]).toContain("first-front");
    expect(lines[0]).toContain("tiers");
  });
});
