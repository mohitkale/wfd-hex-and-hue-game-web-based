import { describe, expect, it } from "vitest";
import { EMPTY, type Level, type WispSpec } from "./level";
import {
  canLaunch,
  cloneState,
  createState,
  launch,
  runUntilIdle,
  step,
  trackFor,
  type SimEvent,
} from "./sim";

const _ = EMPTY;
const col = { kind: "column", index: 0 } as const;
const col1 = { kind: "column", index: 1 } as const;
const slot0 = { kind: "slot", index: 0 } as const;

function level(
  width: number,
  height: number,
  cells: number[],
  columns: WispSpec[][],
  opts: Partial<Pick<Level, "slots" | "trackCap">> = {},
): Level {
  return {
    id: "t",
    name: "t",
    width,
    height,
    palette: ["#aa66ff", "#ffd966", "#66ddff"],
    cells,
    columns,
    slots: opts.slots ?? 5,
    trackCap: opts.trackCap ?? 5,
  };
}

/** 3×3 with a color-0 center fully hidden behind a color-1 ring. */
const hiddenCenter = (columns: WispSpec[][], slots = 5) =>
  createState(level(3, 3, [1, 1, 1, 1, 0, 1, 1, 1, 1], columns, { slots }));

const types = (events: SimEvent[]) => events.map((e) => e.type);

describe("createState", () => {
  it("copies the level and assigns stable ids column by column", () => {
    const lvl = level(2, 1, [0, 1], [[{ color: 0, charge: 1 }], [{ color: 1, charge: 1 }]]);
    const s = createState(lvl);
    expect(s.remaining).toBe(2);
    expect(s.columns.map((c) => c.map((w) => w.id))).toEqual([[0], [1]]);
    expect(s.slots).toEqual([null, null, null, null, null]);
    s.cells[0] = _;
    expect(lvl.cells[0]).toBe(0);
  });
});

describe("launch and track rules", () => {
  it("places the front column wisp at the entry", () => {
    const s = createState(level(1, 1, [0], [[{ color: 0, charge: 1 }]]));
    expect(launch(s, col)).toEqual({ type: "launched", wispId: 0, from: col });
    expect(s.columns[0]).toEqual([]);
    expect(s.track).toEqual([{ id: 0, color: 0, charge: 1, pos: 0, traveled: 0 }]);
  });

  it("allows only one launch per step because the entry is occupied", () => {
    const s = createState(
      level(2, 1, [0, 1], [[{ color: 0, charge: 1 }], [{ color: 1, charge: 1 }]]),
    );
    expect(launch(s, col)).not.toBeNull();
    expect(canLaunch(s, col1)).toBe(false);
    expect(launch(s, col1)).toBeNull();
    step(s);
    expect(canLaunch(s, col1)).toBe(true);
  });

  it("respects the track cap", () => {
    const s = hiddenCenter([[{ color: 0, charge: 1 }], [{ color: 1, charge: 8 }]]);
    s.trackCap = 1;
    launch(s, col);
    step(s);
    expect(canLaunch(s, col1)).toBe(false);
  });

  it("rejects empty sources", () => {
    const s = createState(level(1, 1, [0], [[{ color: 0, charge: 1 }]]));
    expect(launch(s, slot0)).toBeNull();
    expect(launch(s, { kind: "column", index: 3 })).toBeNull();
  });
});

describe("collection", () => {
  it("collects a matching fragment in sight and leaves via the portal at charge 0", () => {
    const s = createState(level(1, 1, [0], [[{ color: 0, charge: 1 }]]));
    launch(s, col);
    const events = step(s); // pos 1: bottom lane, sees the only cell
    expect(events).toEqual([
      { type: "collected", wispId: 0, pos: 1, cell: 0, color: 0, chargeLeft: 0 },
      { type: "portal", wispId: 0, pos: 1 },
      { type: "won" },
    ]);
    expect(s.status).toBe("won");
    expect(s.track).toEqual([]);
    expect(s.cells).toEqual([_]);
  });

  it("only collects its own color and only the first fragment in sight", () => {
    // 2×1: [0, 1]. Track: 1 sees cell 0, 2 sees cell 1, 4 (right) sees cell 1 first.
    const s = createState(
      level(2, 1, [0, 1], [[{ color: 1, charge: 1 }], [{ color: 0, charge: 1 }]]),
    );
    launch(s, col);
    expect(step(s)).toEqual([]); // sees color 0: no match
    expect(types(step(s))).toEqual(["collected", "portal"]);
    expect(s.cells).toEqual([0, _]);
    expect(s.remaining).toBe(1);
  });

  it("collects at most one fragment per step", () => {
    // 1×2 column of color 0: the bottom lane sees only the nearest fragment.
    const s = createState(level(1, 2, [0, 0], [[{ color: 0, charge: 2 }]]));
    launch(s, col);
    const events = step(s);
    expect(events).toEqual([
      { type: "collected", wispId: 0, pos: 1, cell: 1, color: 0, chargeLeft: 1 },
    ]);
  });

  it("a wisp sweeping a full ring clears it in one lap", () => {
    const s = hiddenCenter([[{ color: 1, charge: 8 }], [{ color: 0, charge: 1 }]]);
    launch(s, col);
    const events = runUntilIdle(s);
    expect(events.filter((e) => e.type === "collected")).toHaveLength(8);
    expect(events.at(-1)).toMatchObject({ type: "portal", wispId: 0 });
    expect(s.cells).toEqual([_, _, _, _, 0, _, _, _, _]);
  });

  it("processes the front-most wisp first when two see the same fragment", () => {
    // 1×1 board: bottom lane (pos 1) and left lane (pos 7) both see cell 0.
    const s = createState(level(1, 1, [0], [[{ color: 0, charge: 1 }]]));
    s.track = [
      { id: 10, color: 0, charge: 1, pos: 6, traveled: 6 },
      { id: 11, color: 0, charge: 1, pos: 0, traveled: 0 },
    ];
    const events = step(s);
    expect(events[0]).toMatchObject({ type: "collected", wispId: 10 });
    expect(s.track.map((w) => w.id)).toEqual([11]);
  });
});

describe("multiple wisps and authored data", () => {
  it("two wisps cooperate: the leader opens a line the follower collects through", () => {
    // Ring wisp leads by one cell; when it clears cell 7 (bottom of column 1) the center wisp,
    // arriving at the same track cell next step, sees the center fragment.
    const s = hiddenCenter([[{ color: 1, charge: 8 }], [{ color: 0, charge: 1 }]]);
    launch(s, col);
    step(s);
    launch(s, col1);
    step(s);
    expect(step(s)).toEqual([
      { type: "collected", wispId: 0, pos: 3, cell: 8, color: 1, chargeLeft: 5 },
      { type: "collected", wispId: 1, pos: 2, cell: 4, color: 0, chargeLeft: 0 },
      { type: "portal", wispId: 1, pos: 2 },
    ]);
    const rest = runUntilIdle(s);
    expect(rest.at(-1)).toEqual({ type: "won" });
    expect(s.track).toEqual([]);
  });

  it("ignores ids or extra fields on authored wisps", () => {
    const lvl = level(1, 1, [0], [[{ color: 0, charge: 1, id: 99 } as WispSpec]]);
    const s = createState(lvl);
    expect(s.columns[0]).toEqual([{ id: 0, color: 0, charge: 1 }]);
  });
});

describe("laps, slots and losing", () => {
  it("parks a wisp with charge left after one full lap", () => {
    const s = hiddenCenter([[{ color: 0, charge: 1 }], [{ color: 1, charge: 8 }]]);
    const lap = trackFor(3, 3).length;
    launch(s, col);
    for (let i = 1; i < lap; i++) expect(step(s)).toEqual([]);
    expect(step(s)).toEqual([{ type: "parked", wispId: 0, slot: 0 }]);
    expect(s.slots[0]).toEqual({ id: 0, color: 0, charge: 1 });
    expect(s.track).toEqual([]);
    expect(s.status).toBe("playing");
  });

  it("relaunches from a slot and can then win", () => {
    const s = hiddenCenter([[{ color: 0, charge: 1 }], [{ color: 1, charge: 8 }]]);
    launch(s, col);
    runUntilIdle(s);
    launch(s, col1);
    runUntilIdle(s);
    expect(launch(s, slot0)).toEqual({ type: "launched", wispId: 0, from: slot0 });
    expect(s.slots[0]).toBeNull();
    const events = runUntilIdle(s);
    expect(types(events)).toEqual(["collected", "portal", "won"]);
    expect(s.status).toBe("won");
  });

  it("parks into a slot freed by a relaunch earlier in the turn", () => {
    const s = hiddenCenter([[{ color: 0, charge: 1 }], [{ color: 0, charge: 1 }]], 1);
    launch(s, col);
    runUntilIdle(s);
    launch(s, slot0); // frees the only slot
    step(s);
    launch(s, col1);
    const events = runUntilIdle(s);
    expect(events.filter((e) => e.type === "parked")).toEqual([
      { type: "parked", wispId: 0, slot: 0 },
    ]);
    expect(events.at(-1)).toEqual({ type: "lost", wispId: 1 });
  });

  it("freezes mid-step on a loss, leaving trailing wisps on the track", () => {
    const s = hiddenCenter(
      [[{ color: 0, charge: 1 }], [{ color: 0, charge: 1 }], [{ color: 0, charge: 1 }]],
      1,
    );
    const lap = trackFor(3, 3).length;
    launch(s, col);
    runUntilIdle(s);
    launch(s, col1);
    step(s);
    launch(s, { kind: "column", index: 2 });
    for (let i = 2; i < lap; i++) step(s);
    // Wisp 1 finishes its lap with the only slot taken; wisp 2 is one cell behind it.
    expect(step(s)).toEqual([{ type: "lost", wispId: 1 }]);
    expect(s.track.map((w) => [w.id, w.pos, w.traveled])).toEqual([
      [1, 0, lap],
      [2, lap - 1, lap - 1],
    ]);
    expect(step(s)).toEqual([]);
  });

  it("is inert after a win", () => {
    const s = createState(level(1, 1, [0], [[{ color: 0, charge: 1 }]]));
    launch(s, col);
    step(s);
    expect(s.status).toBe("won");
    const stepsBefore = s.step;
    expect(step(s)).toEqual([]);
    expect(s.step).toBe(stepsBefore);
  });

  it("loses when a lap ends with every slot full", () => {
    const s = hiddenCenter([[{ color: 0, charge: 1 }], [{ color: 0, charge: 1 }]], 1);
    launch(s, col);
    runUntilIdle(s);
    expect(s.slots).toEqual([{ id: 0, color: 0, charge: 1 }]);
    launch(s, col1);
    const events = runUntilIdle(s);
    expect(events).toEqual([{ type: "lost", wispId: 1 }]);
    expect(s.status).toBe("lost");
    expect(launch(s, slot0)).toBeNull();
    expect(step(s)).toEqual([]);
  });
});

describe("determinism and snapshots", () => {
  it("cloneState is independent of the original", () => {
    const s = hiddenCenter([[{ color: 1, charge: 8 }], [{ color: 0, charge: 1 }]]);
    launch(s, col);
    const snap = cloneState(s);
    runUntilIdle(s);
    expect(snap.track).toHaveLength(1);
    expect(snap.remaining).toBe(9);
    expect(snap.cells).not.toEqual(s.cells);
  });

  it("the same actions always produce the same state", () => {
    const play = () => {
      const s = hiddenCenter([[{ color: 1, charge: 8 }], [{ color: 0, charge: 1 }]]);
      launch(s, col);
      step(s);
      step(s);
      launch(s, col1);
      runUntilIdle(s);
      return JSON.stringify(s);
    };
    expect(play()).toEqual(play());
  });
});
