import { describe, expect, it } from "vitest";
import { createRng } from "../rng";
import { IllegalActionError, legalActions, type Action } from "./actions";
import type { CollectEvent, TickBatch } from "./events";
import { board, fixtureA, fixtureB, fixtureE, randomLevel } from "./fixtures";
import { validateCollectLevel, type CollectLevel } from "./level";
import { CollectSession, ReplayError, replay } from "./session";
import { isSettled } from "./sim";
import { hashState } from "./state";

const select = (column: number): Action => ({ kind: "select", column });
const resume = (slot: number): Action => ({ kind: "resume", slot });

/** Ticks the session until settled (bounded). */
function settle(session: CollectSession): void {
  for (let i = 0; i < 5_000 && session.tick() !== null; i++) {
    /* keep ticking */
  }
  expect(isSettled(session.state) || session.state.status !== "playing", "did not settle").toBe(
    true,
  );
}

/**
 * Plays a random game on a session (actions at settle points and sometimes mid-flight), recording
 * the hash after every tick so a replay can be checked tick by tick.
 */
function randomGame(level: CollectLevel, seed: number) {
  const rng = createRng(seed);
  const session = new CollectSession(level);
  const batches: TickBatch[] = [];
  session.subscribe((b) => batches.push(b));
  const hashAtTick = new Map<number, string>([[0, hashState(session.state)]]);
  for (let i = 0; i < 20_000 && session.state.status === "playing"; i++) {
    if (isSettled(session.state) || rng.next() < 0.15) {
      const legal = legalActions(session.state);
      if (legal.length > 0) session.tap(legal[rng.int(0, legal.length - 1)]!);
    }
    if (session.tick() === null && isSettled(session.state)) {
      const legal = legalActions(session.state);
      if (legal.length === 0) break;
    }
    hashAtTick.set(session.state.tick, hashState(session.state));
  }
  return { session, batches, hashAtTick };
}

const nonEmpty = (batches: TickBatch[]) => batches.filter((b) => b.events.length > 0);

describe("CollectSession", () => {
  it("rejects an invalid level", () => {
    const level = { ...fixtureA(), slots: 0 };
    expect(() => new CollectSession(level)).toThrow("Invalid level");
  });

  it("emits one batch per applied action and per tick, tagged with the tick", () => {
    const session = new CollectSession(fixtureA());
    const seen: TickBatch[] = [];
    session.subscribe((b) => seen.push(b));
    expect(session.tap(select(0))).toEqual({
      ok: true,
      reason: "ok",
      events: [{ type: "groupSelected", group: 0, column: 0 }],
    });
    expect(seen).toEqual([{ tick: 0, events: [{ type: "groupSelected", group: 0, column: 0 }] }]);
    const t1 = session.tick()!;
    expect(t1.tick).toBe(1);
    expect(t1.events.map((e) => e.type)).toEqual(["familiarSpawned", "cubeReserved"]);
    expect(seen).toHaveLength(2);
    settle(session);
    // Ticks arrive one at a time with consecutive numbers.
    const ticks = seen.slice(1).map((b) => b.tick);
    expect(ticks).toEqual(ticks.map((_, i) => i + 1));
    expect(session.tick()).toBeNull(); // settled: no tick elapses
    expect(seen.at(-1)!.tick).toBe(7);
  });

  it("an illegal tap changes nothing: no event, no log entry, no snapshot", () => {
    const session = new CollectSession(fixtureB());
    const seen: TickBatch[] = [];
    session.subscribe((b) => seen.push(b));
    const hash = hashState(session.state);
    expect(session.tap(select(9))).toEqual({ ok: false, reason: "unavailable", events: [] });
    expect(session.tap(resume(0))).toEqual({ ok: false, reason: "unavailable", events: [] });
    expect(session.check(select(0))).toBe("ok");
    expect(seen).toEqual([]);
    expect(session.log).toEqual([]);
    expect(session.canUndo).toBe(false);
    expect(hashState(session.state)).toBe(hash);
  });

  it("records the log with the tick each action was applied at", () => {
    const session = new CollectSession(fixtureB());
    session.tap(select(0));
    settle(session);
    session.tap(select(1));
    settle(session);
    expect(session.log).toEqual([
      { tick: 0, action: select(0) },
      { tick: 5, action: select(1) },
    ]);
    expect(session.state.lossReason).toBe("slotsFull");
  });

  it("two actions at one tick are logged and replayed in order", () => {
    const session = new CollectSession(fixtureE());
    session.tap(select(0));
    session.tap(select(1));
    expect(session.log.map((e) => e.tick)).toEqual([0, 0]);
    settle(session);
    const r = replay(fixtureE(), session.log);
    expect(hashState(r.state)).toBe(hashState(session.state));
  });
});

describe("undo", () => {
  it("restores the exact state before the last action and truncates the log", () => {
    const session = new CollectSession(fixtureB());
    const start = hashState(session.state);
    session.tap(select(0));
    settle(session);
    const parked = hashState(session.state);
    session.tap(select(2));
    settle(session);
    expect(session.log).toHaveLength(2);

    const replaced: string[] = [];
    session.onReplace((r) => replaced.push(r));
    expect(session.undo()).toBe(true);
    expect(hashState(session.state)).toBe(parked);
    expect(session.log).toEqual([{ tick: 0, action: select(0) }]);
    expect(replaced).toEqual(["undo"]);

    expect(session.undo()).toBe(true);
    expect(hashState(session.state)).toBe(start);
    expect(session.log).toEqual([]);
    expect(session.canUndo).toBe(false);
    expect(session.undo()).toBe(false);
  });

  it("recovers from a loss, and play continues deterministically afterwards", () => {
    const session = new CollectSession(fixtureB());
    session.tap(select(0));
    settle(session);
    session.tap(select(1));
    settle(session);
    expect(session.state.status).toBe("lost");
    expect(session.undo()).toBe(true); // back to R parked, G still queued
    expect(session.state.status).toBe("playing");
    session.tap(select(2)); // the better move: clear the blue first
    settle(session);
    session.tap(resume(0));
    settle(session);
    session.tap(select(1));
    settle(session);
    expect(session.state.status).toBe("won");
    // The final log replays to the same result.
    expect(hashState(replay(fixtureB(), session.log).state)).toBe(hashState(session.state));
  });

  it("keeps at most maxUndo snapshots", () => {
    const level = board(["RGB"], [[["R", 1]], [["G", 1]], [["B", 1]]], { colors: "RGB" });
    const session = new CollectSession(level, 2);
    session.tap(select(0));
    session.tap(select(1));
    session.tap(select(2));
    expect(session.undo()).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.undo()).toBe(false);
    expect(session.log).toEqual([{ tick: 0, action: select(0) }]);
  });

  it("restart clears state, log and snapshots", () => {
    const session = new CollectSession(fixtureA());
    const start = hashState(session.state);
    session.tap(select(0));
    settle(session);
    const replaced: string[] = [];
    session.onReplace((r) => replaced.push(r));
    session.restart();
    expect(hashState(session.state)).toBe(start);
    expect(session.log).toEqual([]);
    expect(session.canUndo).toBe(false);
    expect(replaced).toEqual(["restart"]);
  });
});

describe("replay", () => {
  it("reproduces the state and the event sequence of random games exactly", () => {
    let compared = 0;
    const levels: CollectLevel[] = [];
    for (let seed = 1; seed <= 600 && levels.length < 120; seed++) {
      const level = randomLevel(seed, seed % 3 !== 0);
      if (level && validateCollectLevel(level).length === 0) levels.push(level);
    }
    levels.forEach((level, i) => {
      const { session, batches } = randomGame(level, 5000 + i);
      const r = replay(level, session.log, session.state.tick);
      expect(hashState(r.state), level.id).toBe(hashState(session.state));
      expect(nonEmpty(r.batches), level.id).toEqual(nonEmpty(batches));
      compared++;
    });
    expect(compared).toBeGreaterThanOrEqual(100);
  });

  it("untilTick stops at exactly that tick, inclusive of actions applied at it", () => {
    let level: CollectLevel | null = null;
    for (let seed = 1; seed < 200 && !level; seed++) {
      const candidate = randomLevel(seed, true);
      if (candidate && validateCollectLevel(candidate).length === 0) level = candidate;
    }
    if (!level) throw new Error("no valid random level");
    const { session, hashAtTick } = randomGame(level, 777);
    const last = session.state.tick;
    expect(last).toBeGreaterThan(4);
    for (const k of [1, 2, Math.floor(last / 2), last]) {
      const r = replay(level, session.log, k);
      expect(r.state.tick).toBe(k);
      // A hash taken after the tick (and after any action applied at it) equals the replay's.
      if (hashAtTick.has(k) && !session.log.some((e) => e.tick === k)) {
        expect(hashState(r.state), `tick ${k}`).toBe(hashAtTick.get(k));
      }
    }
    expect(replay(level, session.log, 0).state.tick).toBe(0);
  });

  it("runs to settled when the log ends", () => {
    const r = replay(fixtureA(), [{ tick: 0, action: select(0) }]);
    expect(isSettled(r.state)).toBe(true);
    expect(r.state.tick).toBe(7);
    expect(r.state.groups[0]!.status).toBe("completed");
  });

  it("fails loudly on an illegal entry, a decreasing tick, or an unreachable tick", () => {
    const bad = (log: { tick: number; action: Action }[], text: string, index: number) => {
      try {
        replay(fixtureA(), log);
        expect.unreachable("replay should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ReplayError);
        expect((e as ReplayError).index).toBe(index);
        expect((e as Error).message).toContain(text);
      }
    };
    bad([{ tick: 0, action: select(7) }], "unavailable", 0);
    bad(
      [
        { tick: 0, action: select(0) },
        { tick: 3, action: select(1) },
        { tick: 1, action: select(1) },
      ],
      "before the current tick",
      2,
    );
    // The first group settles at tick 7: tick 40 is never reached.
    bad(
      [
        { tick: 0, action: select(0) },
        { tick: 40, action: select(1) },
      ],
      "never reached",
      1,
    );
    expect(() => replay(fixtureA(), [{ tick: 0, action: select(7) }])).toThrow(ReplayError);
    try {
      replay(fixtureA(), [{ tick: 0, action: select(7) }]);
    } catch (e) {
      expect((e as ReplayError).cause).toBeInstanceOf(IllegalActionError);
    }
  });
});

describe("replay details", () => {
  it("untilTick applies actions logged at exactly that tick, and excludes later ones", () => {
    const log = [
      { tick: 0, action: select(0) },
      { tick: 5, action: select(2) },
    ];
    const at0 = replay(fixtureB(), log, 0);
    expect(at0.state.tick).toBe(0);
    expect(at0.state.groups[0]!.status).toBe("working");
    expect(at0.events).toEqual([{ type: "groupSelected", group: 0, column: 0 }]);

    const before5 = replay(fixtureB(), log, 4);
    expect(before5.state.groups[2]!.status).toBe("queued"); // the tick-5 action is not applied yet
    const at5 = replay(fixtureB(), log, 5);
    expect(at5.state.tick).toBe(5);
    expect(at5.state.groups[2]!.status).toBe("working"); // applied at tick 5, inclusive
    expect(at5.batches.at(-1)).toEqual({
      tick: 5,
      events: [{ type: "groupSelected", group: 2, column: 2 }],
    });
  });

  it("applies actions logged at the same tick in log order (observable in the events)", () => {
    const log = [
      { tick: 0, action: select(0) },
      { tick: 0, action: select(1) },
    ];
    const forward = replay(fixtureE(), log);
    expect(forward.batches.slice(0, 2)).toEqual([
      { tick: 0, events: [{ type: "groupSelected", group: 0, column: 0 }] },
      { tick: 0, events: [{ type: "groupSelected", group: 1, column: 1 }] },
    ]);
    const reversed = replay(fixtureE(), [...log].reverse());
    expect(reversed.batches.slice(0, 2)).toEqual([
      { tick: 0, events: [{ type: "groupSelected", group: 1, column: 1 }] },
      { tick: 0, events: [{ type: "groupSelected", group: 0, column: 0 }] },
    ]);
  });

  it("refuses invalid levels and non-integer ticks", () => {
    expect(() => replay({ ...fixtureA(), slots: 0 }, [])).toThrow("Invalid level");
    expect(() => replay(fixtureA(), [], -1)).toThrow("untilTick");
    expect(() => replay(fixtureA(), [], Number.NaN)).toThrow("untilTick");
    expect(() => replay(fixtureA(), [{ tick: Number.NaN, action: select(0) }])).toThrow(
      ReplayError,
    );
    expect(() => replay(fixtureA(), [{ tick: 1.5, action: select(0) }])).toThrow(
      "non-negative integer",
    );
  });
});

describe("session robustness", () => {
  it("a throwing subscriber does not break the tap, the tick or the other subscribers", () => {
    const errors: unknown[] = [];
    const session = new CollectSession(fixtureA(), 50, (e) => errors.push(e));
    const good: TickBatch[] = [];
    session.subscribe(() => {
      throw new Error("broken view");
    });
    session.subscribe((b) => good.push(b));
    session.onReplace(() => {
      throw new Error("broken replace view");
    });
    const result = session.tap(select(0));
    expect(result.ok).toBe(true);
    expect(session.log).toHaveLength(1);
    expect(session.canUndo).toBe(true);
    expect(session.tick()).not.toBeNull();
    expect(good.map((b) => b.tick)).toEqual([0, 1]);
    expect(session.undo()).toBe(true);
    expect(errors.map((e) => (e as Error).message)).toEqual([
      "broken view",
      "broken view",
      "broken replace view",
    ]);
  });

  it("hands out copies: mutating the log or an action cannot change the session", () => {
    const session = new CollectSession(fixtureB());
    const action = select(0) as { kind: "select"; column: number };
    session.tap(action);
    action.column = 2;
    expect(session.log[0]!.action).toEqual(select(0));
    (session.log as unknown as { tick: number }[]).length = 0; // mutating a copy
    expect(session.log).toHaveLength(1);
  });
});

describe("event order (snapshot of fixture E, two groups at once)", () => {
  it("is phase order, then group id order, tick by tick", () => {
    const session = new CollectSession(fixtureE());
    const seen: CollectEvent[][] = [];
    session.subscribe((b) => seen.push(b.events));
    session.tap(select(0));
    session.tap(select(1));
    settle(session);
    const types = seen.map((events) => events.map((e) => e.type));
    expect(types).toEqual([
      ["groupSelected"],
      ["groupSelected"],
      // tick 1: group 0 spawns and reserves; group 1 finds nothing and parks.
      ["familiarSpawned", "cubeReserved", "groupParked"],
      // tick 2: the pickup exposes the red behind it.
      ["cubePickedUp"],
      // tick 3: delivery, retirement, completion.
      ["cubeDelivered", "familiarRetired", "groupCompleted"],
    ]);
  });
});
