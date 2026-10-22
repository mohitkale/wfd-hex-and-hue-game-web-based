import { describe, expect, it } from "vitest";
import { apply, explain, type Action } from "./actions";
import type { CollectEvent } from "./events";
import { board, fixtureA, fixtureB } from "./fixtures";
import { paddedIndex } from "./grid";
import { isSettled, runUntilSettled, step } from "./sim";
import {
  cloneState,
  createCollectState,
  fromJSON,
  hashState,
  stateKey,
  type CollectState,
} from "./state";

const select = (column: number): Action => ({ kind: "select", column });
const resume = (slot: number): Action => ({ kind: "resume", slot });

const json = (s: CollectState): Record<string, unknown> => JSON.parse(JSON.stringify(s));

describe("hashState", () => {
  it("changes with every part of the logical state and ignores derived data", () => {
    const base = createCollectState(fixtureA());
    apply(base, select(0));
    step(base); // a familiar exists
    const h = hashState(base);
    expect(hashState(cloneState(base))).toBe(h);

    const mutations: Record<string, (s: CollectState) => void> = {
      tick: (s) => void s.tick++,
      status: (s) => void (s.status = "lost"),
      grid: (s) => void (s.grid[paddedIndex(5, 0, 0)] = -1),
      groups: (s) => void s.groups[0]!.delivered++,
      columns: (s) => void s.columns[1]!.pop(),
      slots: (s) => void (s.slots[1] = 0),
      familiar: (s) => void s.familiars[0]!.at++,
      familiarId: (s) => void s.nextFamiliarId++,
      delivered: (s) => void s.deliveredTotal++,
      params: (s) => void s.params.spawnGap++,
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const s = cloneState(base);
      mutate(s);
      expect(hashState(s), name).not.toBe(h);
    }
    // Derived fields do not matter: they are recomputed from the rest.
    const s = cloneState(base);
    s.dist[0] = 99;
    s.reserved[0] = 1;
    expect(hashState(s)).toBe(h);
  });
});

describe("stateKey (solver identity of a settled state)", () => {
  const parked = () => {
    const level = { ...fixtureB(), slots: 2 };
    const s = createCollectState(level);
    apply(s, select(0));
    runUntilSettled(s);
    expect(s.slots[0]).toBe(0);
    return s;
  };

  it("ignores tick, slot numbers and timers", () => {
    const a = parked();
    const key = stateKey(a);
    const b = cloneState(a);
    b.tick += 17;
    b.slots = [null, 0]; // same waiting group in the other slot
    b.groups.forEach((g) => (g.nextSpawn += 5));
    expect(stateKey(b)).toBe(key);
  });

  it("changes with the cubes left, the queued counts and the waiting (colour, remaining) set", () => {
    const a = parked();
    const key = stateKey(a);
    const fewerCubes = cloneState(a);
    fewerCubes.grid[fewerCubes.grid.findIndex((c) => c === 0)] = -1;
    expect(stateKey(fewerCubes)).not.toBe(key);

    const fewerQueued = cloneState(a);
    fewerQueued.columns[2]!.pop();
    expect(stateKey(fewerQueued)).not.toBe(key);

    const lessRemaining = cloneState(a);
    lessRemaining.groups[0]!.delivered++;
    expect(stateKey(lessRemaining)).not.toBe(key);

    const otherColour = cloneState(a);
    otherColour.groups[0]!.color = 2;
    expect(stateKey(otherColour)).not.toBe(key);
  });

  it("is equal for two routes to the same settled position", () => {
    // Blue first, then red, versus red first then blue: different histories, same final position.
    const x = createCollectState(fixtureB());
    const y = createCollectState(fixtureB());
    apply(x, select(2));
    runUntilSettled(x);
    apply(y, select(2));
    runUntilSettled(y);
    expect(stateKey(x)).toBe(stateKey(y));
    apply(x, select(0));
    runUntilSettled(x);
    expect(stateKey(x)).not.toBe(stateKey(y));
  });
});

describe("fromJSON", () => {
  const running = () => {
    const s = createCollectState(fixtureA());
    apply(s, select(0));
    step(s);
    return s;
  };

  it("round-trips a mid-game state and recomputes the derived fields", () => {
    const s = running();
    const j = json(s);
    j.dist = new Array(s.dist.length).fill(7); // tampered derived data is not trusted
    j.reserved = new Array(s.dist.length).fill(1);
    const back = fromJSON(j);
    expect(back.dist).toEqual(s.dist);
    expect(back.reserved).toEqual(s.reserved);
    expect(hashState(back)).toBe(hashState(s));
  });

  it("does not flag a carried cube as reserved", () => {
    const s = running();
    step(s); // pickup: the cube is carried
    expect(s.familiars[0]!.status).toBe("deliver");
    const back = fromJSON(json(s));
    expect(back.reserved.every((r) => r === 0)).toBe(true);
  });

  const bad: [string, (j: Record<string, unknown>) => void, string][] = [
    ["a missing key", (j) => void delete j.grid, "missing grid"],
    [
      "a missing portal",
      (j) => void delete (j.params as Record<string, unknown>).portal,
      "params.portal",
    ],
    [
      "a portal off the grid",
      (j) => void ((j.params as Record<string, unknown>).portal = 9999),
      "params.portal",
    ],
    [
      "a portal on a cube",
      (j) => void ((j.params as Record<string, unknown>).portal = paddedIndex(5, 0, 0)),
      "portal cell holds a cube",
    ],
    ["a wrong stride", (j) => void ((j.params as Record<string, unknown>).stride = 4), "stride"],
    ["a wrong grid size", (j) => void (j.grid as number[]).pop(), "grid size"],
    ["a bad cell", (j) => void ((j.grid as unknown[])[0] = "x"), "grid[0]"],
    ["wrong slots length", (j) => void (j.slots = []), "slots must be an array of length"],
    [
      "a column naming a missing group",
      (j) => void ((j.columns as number[][])[1] = [99]),
      "missing group",
    ],
    [
      "a column holding a started group",
      (j) => void ((j.columns as number[][])[1] = [0]),
      "not queued",
    ],
    [
      "a slot holding a non-waiting group",
      (j) => void ((j.slots as unknown[])[0] = 1),
      "not waiting",
    ],
    [
      "a group id out of order",
      (j) => void ((j.groups as { id: number }[])[1]!.id = 5),
      "equal its index",
    ],
    [
      "a bad group status",
      (j) => void ((j.groups as { status: string }[])[0]!.status = "asleep"),
      "status is invalid",
    ],
    [
      "a familiar without a cube",
      (j) => void ((j.familiars as { cube: number }[])[0]!.cube = -1),
      "cube is out of range",
    ],
    [
      "a familiar off its route",
      (j) => void ((j.familiars as { at: number }[])[0]!.at = 5),
      "outside its route",
    ],
    [
      "a familiar whose route skips the portal",
      (j) => void ((j.familiars as { route: number[] }[])[0]!.route = [1]),
      "start at the portal",
    ],
    [
      "a familiar that disagrees with the board",
      (j) => void ((j.grid as number[])[paddedIndex(5, 1, 0)] = -1),
      "disagrees with the board",
    ],
    ["a stale familiar id counter", (j) => void (j.nextFamiliarId = 0), "nextFamiliarId"],
    ["a non-object", () => undefined, "not an object"],
  ];
  it.each(bad)("rejects %s", (_name, mutate, message) => {
    const j = json(running());
    mutate(j);
    expect(() => fromJSON(_name === "a non-object" ? 42 : j)).toThrow(message);
  });
});

describe("edge cases the engine must handle", () => {
  const events = (s: CollectState): CollectEvent[] => runUntilSettled(s);

  it("works with a non-default portal column", () => {
    const level = { ...fixtureA(), portalX: 0 };
    const s = createCollectState(level);
    expect(s.params.portal).toBe(paddedIndex(5, 0, 1));
    apply(s, select(0));
    const ev = step(s);
    // The nearest cube now touches the portal at x = 0.
    expect(ev).toContainEqual({ type: "cubeReserved", familiar: 0, cube: paddedIndex(5, 0, 0) });
    runUntilSettled(s);
    expect(s.status).toBe("playing"); // the first group is done; the second is still queued
    apply(s, select(1));
    runUntilSettled(s);
    expect(s.status).toBe("won");
  });

  it("wins a 1×1 board in three ticks", () => {
    const level = board(["R"], [[["R", 1]]], { colors: "R", slots: 1, squad: 1, spawnGap: 1 });
    const s = createCollectState(level);
    apply(s, select(0));
    const ev = events(s);
    expect(s.status).toBe("won");
    expect(s.tick).toBe(3);
    expect(ev.at(-1)).toEqual({ type: "won" });
  });

  it("paces spawns by spawnGap while squad room and capacity remain", () => {
    const level = board(["RRRRR"], [[["R", 5]]], { colors: "R", slots: 1, squad: 3, spawnGap: 3 });
    const s = createCollectState(level);
    apply(s, select(0));
    const spawnTicks: number[] = [];
    for (let i = 0; i < 5_000 && !isSettled(s); i++) {
      const ev = step(s);
      if (ev.some((e) => e.type === "familiarSpawned")) spawnTicks.push(s.tick);
    }
    expect(spawnTicks.slice(0, 3)).toEqual([1, 4, 7]);
    expect(s.status).toBe("won");
  });

  it("R-09: a cube exposed by a pickup is assigned in that same tick's dispatch phase", () => {
    // Blue ring around a hidden yellow; a second yellow is accessible. The blue group picks the
    // cube below the hidden yellow at tick 2; the yellow group spawns for the hidden one at tick 2.
    const level = board(["BBB", "BYB", "YBB"], [[["B", 7]], [["Y", 2]]], {
      colors: "BY",
      slots: 2,
      squad: 3,
      spawnGap: 1,
    });
    const s = createCollectState(level);
    apply(s, select(0));
    apply(s, select(1));
    step(s); // tick 1: blue reserves (1,2); yellow reserves (0,2)
    const hidden = paddedIndex(5, 1, 1);
    expect(s.dist[hidden]).toBe(-1);
    const ev = step(s); // tick 2
    const pickedAt = ev.findIndex(
      (e) => e.type === "cubePickedUp" && e.cube === paddedIndex(5, 1, 2),
    );
    const reservedAt = ev.findIndex((e) => e.type === "cubeReserved" && e.cube === hidden);
    expect(pickedAt).toBeGreaterThanOrEqual(0);
    expect(reservedAt).toBeGreaterThan(pickedAt);
    expect(ev[reservedAt - 1]).toMatchObject({ type: "familiarSpawned", group: 1 });
  });

  it("resume is blocked while fieldCap groups are working", () => {
    const level = { ...fixtureB(), fieldCap: 1 };
    const s = createCollectState(level);
    apply(s, select(0));
    runUntilSettled(s);
    expect(s.groups[0]!.status).toBe("waiting");
    apply(s, select(2)); // blue works: the field is full
    expect(explain(s, resume(0))).toBe("fieldFull");
    expect(explain(s, select(1))).toBe("fieldFull");
    runUntilSettled(s);
    expect(explain(s, resume(0))).toBe("ok");
  });
});
