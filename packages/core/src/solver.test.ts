import { describe, expect, it } from "vitest";
import type { Level, WispSpec } from "./level";
import { GameSession } from "./session";
import { analyzeLevel, solve, verifySolution } from "./solver";

function level(
  width: number,
  height: number,
  cells: number[],
  columns: WispSpec[][],
  slots = 5,
): Level {
  return {
    id: "t",
    name: "t",
    width,
    height,
    palette: ["#aa66ff", "#ffd966", "#66ddff"],
    cells,
    columns,
    slots,
    trackCap: 5,
  };
}

const ring = (columns: WispSpec[][], slots = 5) =>
  level(3, 3, [1, 1, 1, 1, 0, 1, 1, 1, 1], columns, slots);

/**
 * 5×3 with two color-0 fragments fully hidden by color 1, and a color-1 fragment between them. A
 * single column forces both hidden wisps to launch (and park) before the color-1 wisp, which then
 * also parks (the middle fragment stays hidden), so the level needs 3 slots.
 */
const twoHidden = (slots: number) =>
  level(
    5,
    3,
    [1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1],
    [
      [
        { color: 0, charge: 1 },
        { color: 0, charge: 1 },
        { color: 1, charge: 13 },
      ],
    ],
    slots,
  );

/** Plays a sequential solution through the real session, one wisp at a time. */
function playThroughSession(lvl: Level, solution: ReturnType<typeof solve>["solution"]) {
  const s = new GameSession(lvl);
  for (const move of solution ?? []) {
    s.tap(move);
    for (let i = 0; i < 10_000 && s.state.track.length > 0; i++) s.tick();
  }
  return s.state.status;
}

describe("solve", () => {
  it("solves a trivial level greedily", () => {
    const lvl = ring([[{ color: 1, charge: 8 }], [{ color: 0, charge: 1 }]]);
    const r = solve(lvl);
    expect(r.status).toBe("solved");
    expect(r.solution).toEqual([
      { kind: "column", index: 0 },
      { kind: "column", index: 1 },
    ]);
  });

  it("uses a holding slot when the hidden wisp must go first", () => {
    const lvl = ring(
      [
        [
          { color: 0, charge: 1 },
          { color: 1, charge: 8 },
        ],
      ],
      1,
    );
    const r = solve(lvl);
    expect(r.status).toBe("solved");
    expect(r.solution).toEqual([
      { kind: "column", index: 0 },
      { kind: "column", index: 0 },
      { kind: "slot", index: 0 },
    ]);
  });

  it("proves a level unsolvable when slots run out", () => {
    const r = solve(twoHidden(1));
    expect(r.status).toBe("unsolvable");
    expect(r.solution).toBeNull();
  });

  it("proves it unsolvable one slot short, and solves it with enough slots", () => {
    expect(solve(twoHidden(2)).status).toBe("unsolvable");
    const lvl = twoHidden(3);
    const r = solve(lvl);
    expect(r.status).toBe("solved");
    expect(verifySolution(lvl, r.solution!)).toBe(true);
  });

  it("finds a non-greedy solution: a column must be cleared out of the way first", () => {
    // Column 0 front is a hidden-center wisp; the ring wisp is behind it. Column 1 holds a
    // decoy color-2 wisp whose fragment is in a corner (always visible).
    const lvl = level(
      3,
      3,
      [2, 1, 1, 1, 0, 1, 1, 1, 1],
      [
        [
          { color: 0, charge: 1 },
          { color: 1, charge: 7 },
        ],
        [{ color: 2, charge: 1 }],
      ],
      1,
    );
    const r = solve(lvl);
    expect(r.status).toBe("solved");
    expect(verifySolution(lvl, r.solution!)).toBe(true);
  });

  it("reports unknown when the node budget runs out", () => {
    expect(solve(twoHidden(1), { maxNodes: 1 }).status).toBe("unknown");
  });

  it("solutions also win when played through GameSession", () => {
    for (const lvl of [
      twoHidden(3),
      ring(
        [
          [
            { color: 0, charge: 1 },
            { color: 1, charge: 8 },
          ],
        ],
        1,
      ),
    ]) {
      const r = solve(lvl);
      expect(playThroughSession(lvl, r.solution)).toBe("won");
    }
  });
});

describe("verifySolution", () => {
  it("rejects wrong, empty-source and incomplete solutions", () => {
    const lvl = twoHidden(3);
    expect(verifySolution(lvl, [])).toBe(false);
    expect(verifySolution(lvl, [{ kind: "slot", index: 0 }])).toBe(false);
    expect(verifySolution(lvl, [{ kind: "column", index: 0 }])).toBe(false);
  });
});

describe("analyzeLevel", () => {
  it("finds the minimum slots a level needs", () => {
    expect(analyzeLevel(twoHidden(5), { playouts: 10 }).minSlots).toBe(3);
    expect(
      analyzeLevel(ring([[{ color: 1, charge: 8 }], [{ color: 0, charge: 1 }]]), { playouts: 10 })
        .minSlots,
    ).toBe(1);
  });

  it("rates a forgiving level easier than a tight one", () => {
    const easy = analyzeLevel(ring([[{ color: 1, charge: 8 }], [{ color: 0, charge: 1 }]]));
    const hard = analyzeLevel(twoHidden(3));
    expect(easy.lossRate).toBe(0);
    expect(hard.difficulty).toBeGreaterThan(easy.difficulty);
    expect(hard.wisps).toBe(3);
  });

  it("is deterministic for a seed", () => {
    const lvl = twoHidden(3);
    expect(analyzeLevel(lvl, { seed: 5 })).toEqual(analyzeLevel(lvl, { seed: 5 }));
  });

  it("marks unsolvable levels as maximally tight", () => {
    const r = analyzeLevel(twoHidden(1), { playouts: 5 });
    expect(r.minSlots).toBeNull();
    expect(r.lossRate).toBe(1);
    expect(r.difficulty).toBe(1);
  });
});
