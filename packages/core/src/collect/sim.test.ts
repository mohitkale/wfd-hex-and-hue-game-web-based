import { describe, expect, it } from "vitest";
import { apply, explain, IllegalActionError, legalActions, type Action } from "./actions";
import type { CollectEvent } from "./events";
import { board, fixtureA, fixtureB, fixtureC, fixtureD, fixtureE } from "./fixtures";
import { paddedIndex } from "./grid";
import { violation } from "./invariants";
import { isSettled, runUntilSettled, step } from "./sim";
import { createCollectState, type CollectState } from "./state";
import { nearestTarget } from "./targeting";

const select = (column: number): Action => ({ kind: "select", column });
const resume = (slot: number): Action => ({ kind: "resume", slot });

/** Steps once, asserting the engine's invariants held afterwards. */
function tick(s: CollectState): CollectEvent[] {
  const events = step(s);
  expect(violation(s), `tick ${s.tick}`).toBeNull();
  return events;
}

/** Runs to settled, checking invariants after every tick. */
function settle(s: CollectState): CollectEvent[] {
  const events: CollectEvent[] = [];
  for (let i = 0; i < 10_000 && s.status === "playing" && !isSettled(s); i++)
    events.push(...tick(s));
  return events;
}

const types = (events: CollectEvent[]) => events.map((e) => e.type);

describe("fixture A: one familiar, tick by tick (GAME_DESIGN_V2 §14)", () => {
  const P = paddedIndex(5, 1, 1); // portal
  const cell = (x: number) => paddedIndex(5, x, 0);

  it("follows the documented timeline", () => {
    const s = createCollectState(fixtureA());
    expect(s.params.portal).toBe(P);
    apply(s, select(0));
    expect(s.groups[0]!.status).toBe("working");

    // Tick 1: nearest cube (1,0) touches the portal; spawn in `pickup`.
    let ev = tick(s);
    expect(s.tick).toBe(1);
    expect(ev).toEqual([
      { type: "familiarSpawned", familiar: 0, group: 0, routeLength: 0 },
      { type: "cubeReserved", familiar: 0, cube: cell(1) },
    ]);
    expect(s.familiars[0]).toMatchObject({ status: "pickup", route: [P], at: 0, cube: cell(1) });
    expect(s.groups[0]!.committed).toBe(1);

    // Tick 2: pickup; zero-move route goes straight to deliver.
    ev = tick(s);
    expect(ev).toEqual([{ type: "cubePickedUp", familiar: 0, cube: cell(1), color: 0 }]);
    expect(s.familiars[0]!.status).toBe("deliver");
    expect(s.grid[cell(1)]).toBe(-1);
    expect(s.deliveredTotal).toBe(0);

    // Tick 3: deliver (shown number 1), then reassign: target (0,0) from standing cell (1,0).
    ev = tick(s);
    expect(ev).toEqual([
      { type: "cubeDelivered", familiar: 0, group: 0, color: 0, remaining: 1 },
      { type: "cubeReserved", familiar: 0, cube: cell(0) },
    ]);
    expect(s.familiars[0]).toMatchObject({ status: "toCube", route: [P, cell(1)], at: 0 });

    // Tick 4: move to the standing cell, ready to pick up.
    ev = tick(s);
    expect(ev).toEqual([
      { type: "familiarMoved", familiar: 0, from: P, to: cell(1), carrying: false },
    ]);
    expect(s.familiars[0]!.status).toBe("pickup");

    // Tick 5: pickup, then carrying (one move home).
    ev = tick(s);
    expect(ev).toEqual([{ type: "cubePickedUp", familiar: 0, cube: cell(0), color: 0 }]);
    expect(s.familiars[0]!.status).toBe("carrying");

    // Tick 6: back at the portal.
    ev = tick(s);
    expect(ev).toEqual([
      { type: "familiarMoved", familiar: 0, from: cell(1), to: P, carrying: true },
    ]);
    expect(s.familiars[0]!.status).toBe("deliver");

    // Tick 7: second delivery; the group is complete, the familiar retires.
    ev = tick(s);
    expect(ev).toEqual([
      { type: "cubeDelivered", familiar: 0, group: 0, color: 0, remaining: 0 },
      { type: "familiarRetired", familiar: 0 },
      { type: "groupCompleted", group: 0 },
    ]);
    expect(s.tick).toBe(7);
    expect(s.familiars).toEqual([]);
    expect(s.slots).toEqual([null, null]); // it never needed a slot
    expect(isSettled(s)).toBe(true);
    expect(s.status).toBe("playing");
    expect(legalActions(s)).toEqual([select(1)]);

    // Settled: step is a no-op that does not advance the tick.
    expect(step(s)).toEqual([]);
    expect(s.tick).toBe(7);

    // The last group finishes the level; win is on delivery.
    apply(s, select(1));
    const rest = settle(s);
    expect(rest.at(-1)).toEqual({ type: "won" });
    expect(s.status).toBe("won");
    expect(s.deliveredTotal).toBe(3);
  });
});

describe("fixture B: parking, resume, overflow", () => {
  it("line L loses with slotsFull at tick 10, as traced by hand", () => {
    const s = createCollectState(fixtureB());
    apply(s, select(0));
    settle(s);
    expect(s.tick).toBe(5);
    expect(s.groups[0]).toMatchObject({ status: "waiting", delivered: 1, capacity: 2 });
    expect(s.slots).toEqual([0]);

    apply(s, select(1));
    const ev = settle(s);
    expect(s.tick).toBe(10);
    expect(s.status).toBe("lost");
    expect(s.lossReason).toBe("slotsFull");
    expect(ev.at(-1)).toEqual({ type: "lost", reason: "slotsFull", group: 1 });
    // The ledger is frozen where it happened; further steps do nothing.
    expect(step(s)).toEqual([]);
    expect(s.tick).toBe(10);
  });

  it("line W1 parks, clears the blue, resumes and wins", () => {
    const s = createCollectState(fixtureB());
    apply(s, select(0));
    settle(s);
    expect(s.tick).toBe(5);
    apply(s, select(2)); // legal with no free slot: blue never parks
    settle(s);
    expect(s.groups[2]!.status).toBe("completed");
    expect(s.deliveredTotal).toBe(1 + 16);
    expect(legalActions(s)).toEqual([select(1), resume(0)]);
    const resumed = apply(s, resume(0));
    expect(resumed).toEqual([
      { type: "groupResumed", group: 0, slot: 0 },
      { type: "slotReleased", slot: 0 },
    ]);
    settle(s);
    expect(s.groups[0]!.status).toBe("completed");
    apply(s, select(1));
    settle(s);
    expect(s.status).toBe("won");
    expect(s.deliveredTotal).toBe(20);
  });

  it("line W2 clears blue first and never uses the slot", () => {
    const s = createCollectState(fixtureB());
    apply(s, select(2));
    settle(s);
    expect(s.slots).toEqual([null]);
    apply(s, select(0));
    settle(s);
    expect(s.slots).toEqual([null]);
    apply(s, select(1));
    settle(s);
    expect(s.status).toBe("won");
    expect(s.slots).toEqual([null]);
  });
});

describe("fixture C: capacity binding", () => {
  it.each([1, 3])("P:3 takes the three nearest cubes (squad %i)", (squad) => {
    const s = createCollectState(fixtureC(squad));
    const x = (n: number) => paddedIndex(7, n, 0);
    apply(s, select(0));
    const picked = settle(s)
      .filter((e) => e.type === "cubePickedUp")
      .map((e) => (e as { cube: number }).cube);
    expect([...picked].sort()).toEqual([x(1), x(2), x(3)].sort());
    if (squad === 1) expect(picked).toEqual([x(2), x(1), x(3)]);
    expect(s.groups[0]!.status).toBe("completed");
    expect(s.cubesTotal - s.deliveredTotal).toBe(2);
    apply(s, select(1));
    settle(s);
    expect(s.status).toBe("won");
  });
});

describe("fixture D: sealed pocket and an illegal tap", () => {
  it("refuses Y until the pocket opens, at no cost", () => {
    const s = createCollectState(fixtureD());
    expect(explain(s, select(0))).toBe("noReachableCube");
    expect(() => apply(s, select(0))).toThrow(IllegalActionError);
    expect(s.columns[0]).toEqual([0]); // nothing changed
    expect(nearestTarget(s, 1)).toBeNull();
    expect(legalActions(s)).toEqual([select(1)]);

    apply(s, select(1));
    settle(s);
    expect(s.groups[1]!.status).toBe("completed");
    expect(explain(s, select(0))).toBe("ok");
    apply(s, select(0));
    settle(s);
    expect(s.status).toBe("won");
  });
});

describe("edge-case boards", () => {
  it("R-03: a cube inside a channel cut from the edge is accessible at distance 7", () => {
    const level = board(["XXXXX", "..YXX", "XXXXX"], [[["Y", 1]], [["X", 12]]], { colors: "XY" });
    const s = createCollectState(level);
    const target = nearestTarget(s, 1)!;
    expect(target.cube).toBe(paddedIndex(7, 2, 1));
    expect(target.standing).toBe(paddedIndex(7, 1, 1));
    expect(target.distance).toBe(7);
  });

  it("R-05: a pocket touched only diagonally stays sealed until a neighbouring cube goes", () => {
    const level = board([".XXX", "X.YX", "XXXX"], [[["X", 9]], [["Y", 1]]], { colors: "XY" });
    const s = createCollectState(level);
    const pocket = paddedIndex(6, 1, 1);
    // The pocket's cube neighbours (the Y cube is the fourth): left, up, down.
    const walls = [paddedIndex(6, 0, 1), paddedIndex(6, 1, 0), paddedIndex(6, 1, 2)];
    expect(s.dist[pocket]).toBe(-1);
    expect(nearestTarget(s, 1)).toBeNull();
    apply(s, select(0));
    let opened = false;
    for (let i = 0; i < 500 && !isSettled(s); i++) {
      tick(s);
      const anyWallGone = walls.some((w) => s.grid[w] === -1);
      if (!anyWallGone) expect(s.dist[pocket]).toBe(-1);
      if (anyWallGone) {
        opened = true;
        expect(s.dist[pocket]).toBeGreaterThanOrEqual(0);
      }
    }
    expect(opened).toBe(true);
    expect(nearestTarget(s, 1)).not.toBeNull(); // Y is assignable once the X group has cleared up
  });

  it("R-08: two pickups in one tick, two deliveries in the next phases", () => {
    const level = board(["P.Q"], [[["P", 1]], [["Q", 1]]], { colors: "PQ", squad: 1, spawnGap: 1 });
    const s = createCollectState(level);
    apply(s, select(0));
    apply(s, select(1));
    const log: Record<number, CollectEvent[]> = {};
    while (s.status === "playing" && !isSettled(s)) log[s.tick + 1] = tick(s);
    expect(types(log[1]!)).toEqual([
      "familiarSpawned",
      "cubeReserved",
      "familiarSpawned",
      "cubeReserved",
    ]);
    expect(types(log[3]!).filter((t) => t === "cubePickedUp")).toHaveLength(2);
    expect(log[3]!.map((e) => (e as { familiar?: number }).familiar)).toEqual([0, 1]);
    expect(s.tick).toBe(5);
    expect(s.status).toBe("won");
  });

  it("R-16: a one-cell-wide board has every cube accessible from the start", () => {
    const level = board(["X", "X", "X"], [[["X", 3]]], { colors: "X" });
    const s = createCollectState(level);
    apply(s, select(0));
    settle(s);
    expect(s.status).toBe("won");
  });

  it("R-07/R-13: two groups of one colour and one accessible cube — the lower id reserves, the other parks", () => {
    const s = createCollectState(fixtureE());
    apply(s, select(0));
    apply(s, select(1));
    const ev = tick(s);
    expect(ev).toEqual([
      { type: "familiarSpawned", familiar: 0, group: 0, routeLength: 0 },
      { type: "cubeReserved", familiar: 0, cube: paddedIndex(5, 1, 2) },
      { type: "groupParked", group: 1, slot: 0, remaining: 1 },
    ]);
    settle(s);
    expect(s.tick).toBe(3);
    expect(s.groups[0]!.status).toBe("completed");
    expect(legalActions(s)).toEqual([select(2), resume(0)]);
    apply(s, resume(0));
    settle(s);
    apply(s, select(2));
    settle(s);
    expect(s.status).toBe("won");
  });

  it("R-07: with the slot already taken, the second group's stall loses", () => {
    const level = board(["BBB", "BRB", "BRB"], [[["R", 1]], [["R", 1]], [["B", 7]]], {
      colors: "BR",
      slots: 1,
    });
    const s = createCollectState(level);
    s.slots[0] = 99; // another group already holds the only slot (hand-built, so no invariant check)
    apply(s, select(0));
    apply(s, select(1));
    const ev = step(s);
    expect(ev.at(-1)).toEqual({ type: "lost", reason: "slotsFull", group: 1 });
    expect(s.status).toBe("lost");
  });
});

describe("rules of play", () => {
  it("fieldCap limits groups working at once", () => {
    const level = board(["RGB"], [[["R", 1]], [["G", 1]], [["B", 1]]], {
      colors: "RGB",
      fieldCap: 2,
    });
    const s = createCollectState(level);
    apply(s, select(0));
    apply(s, select(1));
    expect(explain(s, select(2))).toBe("fieldFull");
    expect(legalActions(s)).toEqual([]);
    expect(() => apply(s, select(2))).toThrow(IllegalActionError);
    settle(s);
    expect(explain(s, select(2))).toBe("ok");
  });

  it("explains gameOver and unavailable", () => {
    const s = createCollectState(fixtureA());
    expect(explain(s, select(5))).toBe("unavailable");
    expect(explain(s, resume(0))).toBe("unavailable");
    apply(s, select(0));
    settle(s);
    apply(s, select(1));
    settle(s);
    expect(s.status).toBe("won");
    expect(explain(s, select(0))).toBe("gameOver");
  });

  it("detects a deadlock: settled, cubes left, no legal action", () => {
    // A 7×7 blue block around one red. The first group (capacity 2) removes only the two cubes
    // nearest the portal, digging a stub; the red stays sealed and the only blue group left is
    // queued behind the red group.
    const rows = ["BBBBBBB", "BBBBBBB", "BBBBBBB", "BBBRBBB", "BBBBBBB", "BBBBBBB", "BBBBBBB"];
    const level = board(
      rows,
      [
        [["B", 2]],
        [
          ["R", 1],
          ["B", 46],
        ],
      ],
      { colors: "BR", slots: 2 },
    );
    const s = createCollectState(level);
    expect(legalActions(s)).toEqual([select(0)]);
    apply(s, select(0));
    const ev = settle(s);
    expect(s.status).toBe("lost");
    expect(s.lossReason).toBe("deadlock");
    expect(ev.at(-1)).toEqual({ type: "lost", reason: "deadlock", group: null });
    expect(legalActions(s)).toEqual([]);
    expect(s.deliveredTotal).toBe(2);
  });

  it("runUntilSettled equals stepping, and is deterministic across runs", () => {
    const a = createCollectState(fixtureB());
    const b = createCollectState(fixtureB());
    apply(a, select(2));
    apply(b, select(2));
    const evA = runUntilSettled(a);
    const evB: CollectEvent[] = [];
    while (!isSettled(b)) evB.push(...step(b));
    expect(evA).toEqual(evB);
    expect(a).toEqual(b);
  });
});
