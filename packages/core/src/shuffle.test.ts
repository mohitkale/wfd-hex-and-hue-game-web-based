import { describe, expect, it } from "vitest";
import type { Level } from "./level";
import { createRng } from "./rng";
import { shuffleColumns } from "./shuffle";
import { createState, launch, runQuiet } from "./sim";
import { solveState } from "./solver";

/**
 * 5×3: two color-0 fragments hidden under color 1, with a color-1 fragment between them. With one
 * slot, launching a color-0 wisp first loses, so `[[c0, c1], [c0]]` is unsolvable while the
 * arrangements that put the color-1 wisp at a column front are solvable.
 */
const trap: Level = {
  id: "t",
  name: "t",
  width: 5,
  height: 3,
  palette: ["#aa66ff", "#ffd966"],
  cells: [1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1],
  columns: [
    [
      { color: 0, charge: 1 },
      { color: 1, charge: 13 },
    ],
    [{ color: 0, charge: 1 }],
  ],
  slots: 1,
  trackCap: 5,
};

const multiset = (cols: { color: number; charge: number }[][]) =>
  cols
    .flat()
    .map((w) => `${w.color}:${w.charge}`)
    .sort();

describe("shuffleColumns", () => {
  it("turns an unsolvable arrangement into a solvable one, keeping column lengths", () => {
    const s = createState(trap);
    expect(solveState(s).status).toBe("unsolvable");
    for (const seed of [1, 2, 3, 4, 5]) {
      const next = shuffleColumns(s, createRng(seed))!;
      expect(next).not.toBeNull();
      expect(next.columns.map((c) => c.length)).toEqual([2, 1]);
      expect(multiset(next.columns)).toEqual(multiset(s.columns));
      expect(solveState(next).status).toBe("solved");
    }
  });

  it("is deterministic for a seed and never modifies the input", () => {
    const s = createState(trap);
    const before = JSON.stringify(s);
    const a = shuffleColumns(s, createRng(9));
    const b = shuffleColumns(s, createRng(9));
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(JSON.stringify(s)).toEqual(before);
  });

  it("returns null when it runs out of attempts or solver budget", () => {
    const s = createState(trap);
    expect(shuffleColumns(s, createRng(1), 0)).toBeNull();
    expect(shuffleColumns(s, createRng(1), 8, 0)).toBeNull();
  });

  it("returns null when every wisp left is identical (nothing visibly changes)", () => {
    const s = createState({
      ...trap,
      cells: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      columns: [
        [{ color: 1, charge: 5 }],
        [
          { color: 1, charge: 5 },
          { color: 1, charge: 5 },
        ],
      ],
    });
    expect(shuffleColumns(s, createRng(1))).toBeNull();
  });

  it("judges solvability from the current mid-game state", () => {
    const s = createState(trap);
    launch(s, { kind: "column", index: 1 }); // the lone color-0 wisp parks, filling the only slot
    runQuiet(s);
    expect(s.slots[0]).not.toBeNull();
    // The only other arrangement, [c1, c0], loses: the color-1 wisp can't finish in one lap and
    // has nowhere to park. A shuffle that ignored the parked wisp would wrongly accept it.
    expect(shuffleColumns(s, createRng(2))).toBeNull();
  });
});
