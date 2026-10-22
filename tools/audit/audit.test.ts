import { describe, expect, it } from "vitest";
import { validateLevel, verifySolution, type Level } from "@hexhue/core";
import { worlds } from "../../packages/game/src/levels";
import { STRATEGIES, decisionProfile, playsToWin, winRates, type StrategyName } from "./strategies";

/** Two colors side by side, one wisp each: any launch order wins. */
const easy: Level = {
  id: "audit-easy",
  name: "Audit easy",
  width: 4,
  height: 1,
  palette: ["#ff0000", "#00ff00"],
  cells: [0, 0, 1, 1],
  columns: [[{ color: 1, charge: 2 }], [{ color: 0, charge: 2 }]],
  slots: 2,
  trackCap: 2,
};

const names = Object.keys(STRATEGIES) as StrategyName[];

describe("audit strategies", () => {
  it("fixture is a valid level", () => {
    expect(validateLevel(easy)).toEqual([]);
  });

  it("every strategy wins a level where order does not matter", () => {
    for (const n of names) expect(playsToWin(easy, STRATEGIES[n], 1), n).toBe(true);
  });

  it("first-column drains column 0 before touching column 1", () => {
    const level: Level = {
      ...easy,
      columns: [
        [
          { color: 0, charge: 1 },
          { color: 0, charge: 1 },
        ],
        [{ color: 1, charge: 2 }],
      ],
    };
    const picked: number[] = [];
    const strategy: typeof STRATEGIES.random = (s, moves, rand) => {
      const m = STRATEGIES["first-column"](s, moves, rand);
      if (m.kind === "column") picked.push(m.index);
      return m;
    };
    expect(playsToWin(level, strategy, 1)).toBe(true);
    expect(picked).toEqual([0, 0, 1]);
  });

  it("is deterministic for fixed seeds on shipped levels", () => {
    const level = worlds[0]!.levels[4]!.level;
    expect(winRates(level, 8)).toEqual(winRates(level, 8));
  });

  it("decision profile of a no-choice-matters level is all free steps", () => {
    const d = decisionProfile(easy, [
      { kind: "column", index: 0 },
      { kind: "column", index: 1 },
    ]);
    expect(d.steps).toBe(2);
    expect(d.freeSteps).toBe(1);
    expect(d.meanViable).toBe(d.meanMoves);
  });

  it("stored solutions are verified before they are profiled", () => {
    const built = worlds[0]!.levels[0]!;
    expect(verifySolution(built.level, built.solution)).toBe(true);
    const d = decisionProfile(built.level, built.solution);
    expect(d.steps).toBe(built.solution.length);
    expect(d.meanViable).toBeGreaterThanOrEqual(1);
  });
});
