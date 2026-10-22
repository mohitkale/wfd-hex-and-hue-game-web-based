import { describe, expect, it } from "vitest";
import {
  BANDS,
  DETERMINISTIC_IDS,
  STRATEGY_IDS,
  TIERS,
  checkLevel,
  checkWorld,
  simpleWins,
  tierForLevel,
  type LevelMetrics,
  type Tier,
} from "./difficulty";

const allWin = Object.fromEntries(
  DETERMINISTIC_IDS.map((id) => [id, true]),
) as LevelMetrics["wins"];
const allLose = Object.fromEntries(
  DETERMINISTIC_IDS.map((id) => [id, false]),
) as LevelMetrics["wins"];

/** A level that sits comfortably inside the given tier. */
function good(tier: Tier): LevelMetrics {
  const wins = { ...allLose };
  switch (tier) {
    case "tutorial":
      return {
        wins: allWin,
        randomRate: 0.95,
        reachableLoss: false,
        doomedFirstShare: 0,
        solutions: 6,
        winningShare: 0.9,
        slack: 3,
        recoveryDepth: 0,
        planningDepth: 1,
      };
    case "easy":
      return {
        wins: {
          ...wins,
          "first-front": true,
          "tidy-left": true,
          "tidy-right": true,
          largest: true,
        },
        randomRate: 0.7,
        reachableLoss: true,
        doomedFirstShare: 0.1,
        solutions: 4,
        winningShare: 0.7,
        slack: 2,
        recoveryDepth: 1,
        planningDepth: 1,
      };
    case "medium":
      return {
        wins: { ...wins, largest: true, "most-delivered": true },
        randomRate: 0.3,
        reachableLoss: true,
        doomedFirstShare: 0.2,
        solutions: 3,
        winningShare: 0.3,
        slack: 1,
        recoveryDepth: 2,
        planningDepth: 3,
      };
    case "hard":
      return {
        wins: { ...wins, smallest: true },
        randomRate: 0.1,
        reachableLoss: true,
        doomedFirstShare: 0.5,
        solutions: 1,
        winningShare: 0.1,
        slack: 0,
        recoveryDepth: 4,
        planningDepth: 4,
      };
  }
}

describe("difficulty bands", () => {
  it("defines the eight players and seven deterministic ones", () => {
    expect(STRATEGY_IDS).toHaveLength(8);
    expect(DETERMINISTIC_IDS).toHaveLength(7);
    expect(DETERMINISTIC_IDS).not.toContain("random");
  });

  it("maps level numbers to tiers per the curve", () => {
    expect([1, 5, 6, 15, 16, 30, 31, 80].map(tierForLevel)).toEqual([
      "tutorial",
      "tutorial",
      "easy",
      "easy",
      "medium",
      "medium",
      "hard",
      "hard",
    ]);
    expect(() => tierForLevel(0)).toThrow();
  });

  it.each(TIERS)("a comfortable %s level passes", (tier) => {
    expect(checkLevel(good(tier), tier, tier === "tutorial" ? 1 : undefined)).toEqual([]);
  });

  it("bands get strictly stricter about cheap play", () => {
    const wins = TIERS.map((t) => BANDS[t].simpleWins.max ?? 7);
    expect(wins).toEqual([...wins].sort((a, b) => b - a));
    const random = TIERS.map((t) => BANDS[t].randomRate.max ?? 1);
    expect(random).toEqual([...random].sort((a, b) => b - a));
    expect(BANDS.hard.mustLose.length).toBeGreaterThan(BANDS.medium.mustLose.length);
  });

  it("rejects tap-spam on medium and hard (first-front must lose)", () => {
    for (const tier of ["medium", "hard"] as const) {
      const m = good(tier);
      const spam: LevelMetrics = { ...m, wins: { ...m.wins, "first-front": true } };
      expect(checkLevel(spam, tier).join()).toContain("first-front must lose");
    }
  });

  it("rejects a hard level the tidy players or greedy players beat", () => {
    for (const id of ["tidy-left", "tidy-right", "most-delivered", "clears-capacity"] as const) {
      const m = good("hard");
      const bad = { ...m, wins: { ...m.wins, [id]: true } };
      expect(checkLevel(bad, "hard").join(), id).toContain(`${id} must lose`);
    }
  });

  it("rejects a medium level both greedy players beat", () => {
    const m = good("medium");
    const bad = { ...m, wins: { ...m.wins, "most-delivered": true, "clears-capacity": true } };
    expect(checkLevel(bad, "medium").join()).toContain("must not both win");
  });

  it("requires a reachable loss outside the tutorial and none in the first three", () => {
    expect(checkLevel({ ...good("medium"), reachableLoss: false }, "medium").join()).toContain(
      "reachable loss",
    );
    expect(
      checkLevel({ ...good("tutorial"), reachableLoss: true }, "tutorial", 3).join(),
    ).toContain("no reachable loss");
    expect(checkLevel({ ...good("tutorial"), reachableLoss: true }, "tutorial", 4)).toEqual([]);
  });

  it("enforces the numeric bands and reports each violation", () => {
    const m: LevelMetrics = { ...good("hard"), randomRate: 0.6, slack: 3, planningDepth: Infinity };
    const out = checkLevel(m, "hard");
    expect(out.some((s) => s.startsWith("randomRate"))).toBe(true);
    expect(out.some((s) => s.startsWith("slack"))).toBe(true);
    expect(out.some((s) => s.startsWith("planningDepth"))).toBe(true);
  });

  it("counts simple wins", () => {
    expect(simpleWins({ wins: allWin })).toBe(7);
    expect(simpleWins({ wins: allLose })).toBe(0);
  });

  it("flags a world where largest and smallest both win most medium levels", () => {
    const m = good("medium");
    const both = { ...m, wins: { ...m.wins, largest: true, smallest: true } };
    const levels = [
      { tier: "medium" as const, metrics: both },
      { tier: "medium" as const, metrics: both },
      { tier: "medium" as const, metrics: m },
    ];
    expect(checkWorld(levels)).toHaveLength(1);
    expect(checkWorld([levels[0]!, levels[2]!, levels[2]!])).toEqual([]);
    expect(checkWorld([{ tier: "hard", metrics: m }])).toEqual([]);
  });
});
