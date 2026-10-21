import { describe, expect, it } from "vitest";
import type { Level } from "./level";
import { createRng } from "./rng";
import { shuffleColumns } from "./shuffle";
import { createState, launch, runQuiet } from "./sim";
import { solveState } from "./solver";

/** 3×3 color-0 center under a color-1 ring, split across several wisps. */
const level: Level = {
  id: "t",
  name: "t",
  width: 3,
  height: 3,
  palette: ["#aa66ff", "#ffd966"],
  cells: [1, 1, 1, 1, 0, 1, 1, 1, 1],
  columns: [
    [
      { color: 1, charge: 2 },
      { color: 1, charge: 2 },
    ],
    [
      { color: 0, charge: 1 },
      { color: 1, charge: 4 },
    ],
  ],
  slots: 2,
  trackCap: 5,
};

const multiset = (cols: { color: number; charge: number }[][]) =>
  cols
    .flat()
    .map((w) => `${w.color}:${w.charge}`)
    .sort();

describe("shuffleColumns", () => {
  it("re-deals column wisps, keeps column lengths and stays solvable", () => {
    const s = createState(level);
    const next = shuffleColumns(s, createRng(1))!;
    expect(next).not.toBeNull();
    expect(next.columns.map((c) => c.length)).toEqual([2, 2]);
    expect(multiset(next.columns)).toEqual(multiset(s.columns));
    expect(JSON.stringify(next.columns)).not.toEqual(JSON.stringify(s.columns));
    expect(solveState(next).status).toBe("solved");
  });

  it("does not modify the original state", () => {
    const s = createState(level);
    const before = JSON.stringify(s);
    shuffleColumns(s, createRng(2));
    expect(JSON.stringify(s)).toEqual(before);
  });

  it("works mid-game and returns null when nothing can be shuffled", () => {
    const s = createState(level);
    launch(s, { kind: "column", index: 0 });
    runQuiet(s);
    launch(s, { kind: "column", index: 0 });
    launch(s, { kind: "column", index: 1 }); // refused: entry busy
    runQuiet(s);
    // Column 0 is empty; column 1 has 2 wisps left.
    const next = shuffleColumns(s, createRng(3))!;
    expect(next.columns[0]).toEqual([]);
    expect(next.columns[1]!.map((w) => w.color)).toEqual([1, 0]);
    expect(solveState(next).status).toBe("solved");
    const single = createState({
      ...level,
      columns: [[{ color: 1, charge: 8 }], [{ color: 0, charge: 1 }]],
    });
    launch(single, { kind: "column", index: 0 });
    runQuiet(single);
    expect(shuffleColumns(single, createRng(4))).toBeNull();
  });
});
