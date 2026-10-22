import { describe, expect, it } from "vitest";
import { addSlot, applyWand, exposedCells, wandColors } from "./boosters";
import { EMPTY, type Level } from "./level";
import { createState, launch, runQuiet, step, type SimEvent } from "./sim";
import { solveState } from "./solver";

/** 3×3 color-0 center under a color-1 ring. */
const ring: Level = {
  id: "t",
  name: "t",
  width: 3,
  height: 3,
  palette: ["#aa66ff", "#ffd966"],
  cells: [1, 1, 1, 1, 0, 1, 1, 1, 1],
  columns: [
    [
      { color: 1, charge: 4 },
      { color: 1, charge: 4 },
    ],
    [{ color: 0, charge: 1 }],
  ],
  slots: 1,
  trackCap: 5,
};

const charges = (s: ReturnType<typeof createState>, color: number) =>
  [...s.columns.flat(), ...s.slots.filter((w) => w !== null), ...s.track]
    .filter((w) => w.color === color)
    .reduce((n, w) => n + w.charge, 0);
const fragments = (s: ReturnType<typeof createState>, color: number) =>
  s.cells.filter((c) => c === color).length;

describe("exposedCells / wandColors", () => {
  it("finds only fragments some lane can see", () => {
    const s = createState(ring);
    expect(exposedCells(s, 1)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(exposedCells(s, 0)).toEqual([]);
    expect(wandColors(s)).toEqual([1]);
  });
});

describe("applyWand", () => {
  it("collects exposed fragments and takes the same charge from the back of the line", () => {
    const s = createState(ring);
    const r = applyWand(s, 1);
    expect(r.cells).toHaveLength(8);
    expect(s.cells).toEqual([EMPTY, EMPTY, EMPTY, EMPTY, 0, EMPTY, EMPTY, EMPTY, EMPTY]);
    expect(r.spent.sort()).toEqual([0, 1]);
    expect(s.columns[0]).toEqual([]);
    expect(charges(s, 1)).toBe(fragments(s, 1));
    expect(solveState(s).status).toBe("solved");
  });

  it("keeps charges equal to fragments when only part of a wisp is used", () => {
    const lvl: Level = { ...ring, columns: [[{ color: 1, charge: 8 }], [{ color: 0, charge: 1 }]] };
    const s = createState(lvl);
    // Clear the bottom row first so only part of the ring remains exposed later.
    launch(s, { kind: "column", index: 0 });
    for (let i = 0; i < 3; i++) runQuiet(s);
    const before = charges(s, 1);
    applyWand(s, 1);
    expect(charges(s, 1)).toBe(fragments(s, 1));
    expect(before).toBeGreaterThanOrEqual(charges(s, 1));
  });

  it("can win the level outright", () => {
    // 2×2: every cell is on the edge, so all of it is exposed.
    const s = createState({
      ...ring,
      width: 2,
      height: 2,
      cells: [1, 1, 1, 1],
      columns: [[{ color: 1, charge: 4 }]],
    });
    applyWand(s, 1);
    expect(s.status).toBe("won");
    expect(s.remaining).toBe(0);
  });

  it("does nothing for a color with no exposed fragment, or after the game ends", () => {
    const s = createState(ring);
    expect(applyWand(s, 0)).toEqual({ cells: [], spent: [] });
    s.status = "lost";
    expect(applyWand(s, 1).cells).toEqual([]);
  });
});

describe("addSlot", () => {
  it("adds a slot during play", () => {
    const s = createState(ring);
    expect(addSlot(s)).toBeNull();
    expect(s.slots).toHaveLength(2);
  });

  it("revives a lost game by parking the wisp that had nowhere to go", () => {
    const lvl: Level = {
      ...ring,
      columns: [[{ color: 0, charge: 1 }], [{ color: 0, charge: 1 }], [{ color: 1, charge: 8 }]],
    };
    const s = createState(lvl);
    launch(s, { kind: "column", index: 0 });
    runQuiet(s);
    launch(s, { kind: "column", index: 1 });
    runQuiet(s);
    expect(s.status).toBe("lost");
    expect(addSlot(s)).toBe(1);
    expect(s.status).toBe("playing");
    expect(s.slots.map((w) => w?.id ?? null)).toEqual([0, 1]);
    expect(s.track).toEqual([]);
  });

  it("does nothing once won", () => {
    const s = createState(ring);
    s.status = "won";
    expect(addSlot(s)).toBeNull();
    expect(s.slots).toHaveLength(1);
  });
});

describe("revive finishes the interrupted step", () => {
  it("lets a wisp behind the loser collect what it would have collected", () => {
    // Cell 3 (left of center, color 2) is visible only from the left lane at row 1 (pos 14).
    const lvl: Level = {
      ...ring,
      palette: ["#aa66ff", "#ffd966", "#66ddff"],
      cells: [1, 1, 1, 2, 0, 1, 1, 1, 1],
      columns: [[{ color: 0, charge: 1 }], [{ color: 0, charge: 1 }], [{ color: 2, charge: 1 }]],
    };
    const s = createState(lvl);
    launch(s, { kind: "column", index: 0 });
    runQuiet(s); // parks in the only slot
    launch(s, { kind: "column", index: 1 });
    step(s);
    step(s);
    launch(s, { kind: "column", index: 2 }); // two cells behind
    for (let i = 0; i < 40 && s.status === "playing"; i++) step(s);
    expect(s.status).toBe("lost");
    expect(s.cells[3]).toBe(2); // frozen: the trailing wisp hasn't collected yet
    const events: SimEvent[] = [];
    expect(addSlot(s, events)).toBe(1);
    expect(events).toEqual([
      { type: "parked", wispId: 1, slot: 1 },
      { type: "collected", wispId: 2, pos: 14, cell: 3, color: 2, chargeLeft: 0 },
      { type: "portal", wispId: 2, pos: 14 },
    ]);
    expect(s.cells[3]).toBe(EMPTY);
    expect(s.status).toBe("playing");
  });
});

describe("applyWand charge order", () => {
  it("takes owed charge from waiting columns, then slots, then the track", () => {
    const lvl: Level = {
      ...ring,
      width: 2,
      height: 2,
      cells: [1, 1, 1, 1],
      columns: [
        [
          { color: 1, charge: 1 },
          { color: 1, charge: 1 },
        ],
        [{ color: 1, charge: 2 }],
      ],
    };
    const s = createState(lvl);
    launch(s, { kind: "column", index: 1 }); // charge-2 wisp on the track
    const r = applyWand(s, 1);
    expect(r.cells).toHaveLength(4);
    expect(r.spent.sort()).toEqual([0, 1, 2]);
    expect(s.track).toEqual([]);
    expect(s.status).toBe("won");
  });
});
