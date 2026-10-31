import { describe, expect, it } from "vitest";
import { createRng } from "../rng";
import { apply, legalActions, type Action } from "./actions";
import type { CollectEvent } from "./events";
import { fixtureA, fixtureB, fixtureC, fixtureE, randomLevel } from "./fixtures";
import { violation } from "./invariants";
import type { CollectLevel } from "./level";
import { CollectSession, replay } from "./session";
import { isSettled, step } from "./sim";
import { EMPTY } from "../cells";
import { cloneState, createCollectState, fromJSON, hashState, type CollectState } from "./state";

/**
 * M15.1: cross-cutting conformance tests. The rule-by-rule tests live next to each module
 * (rules.test.ts R-01…R-20, sim, slots, seals, boosters); these check properties that must hold
 * across whole games: counts, no duplicate or teleported pickups, simultaneous collectors, resume
 * from a saved state, replay, Undo and boosters, and the exclusivity of winning and losing.
 */

const levels = (): { name: string; level: CollectLevel }[] => {
  const out: { name: string; level: CollectLevel }[] = [
    { name: "fixture A", level: fixtureA() },
    { name: "fixture B", level: fixtureB() },
    { name: "fixture C", level: fixtureC(2) },
    { name: "fixture E", level: fixtureE() },
  ];
  for (let seed = 1; out.length < 44 && seed < 400; seed++) {
    const level = randomLevel(seed, seed % 2 === 0);
    if (level) out.push({ name: `random ${seed}`, level });
  }
  return out;
};
const LEVELS = levels();

/** Picks the next action for a scripted random player (deterministic for a seed). */
function choose(s: CollectState, rng: ReturnType<typeof createRng>): Action | null {
  const legal = legalActions(s);
  return legal.length === 0 ? null : legal[rng.int(0, legal.length - 1)]!;
}

/** Plays a whole game, calling `each` after every applied action and every tick. */
function play(
  level: CollectLevel,
  seed: number,
  hooks: {
    tick?: (s: CollectState, events: CollectEvent[], before: CollectState) => void;
  } = {},
): CollectState {
  const rng = createRng(seed);
  const s = createCollectState(level);
  for (let guard = 0; guard < 50_000 && s.status === "playing"; guard++) {
    // Sometimes act while familiars are out, sometimes only once settled.
    if (isSettled(s) || rng.next() < 0.2) {
      const a = choose(s, rng);
      if (a) {
        const before = cloneState(s);
        const events = apply(s, a);
        hooks.tick?.(s, events, before);
      }
    }
    const before = cloneState(s);
    const events = step(s);
    if (events.length > 0 || s.status !== "playing") hooks.tick?.(s, events, before);
    if (isSettled(s) && legalActions(s).length === 0) break;
  }
  return s;
}

const carried = (s: CollectState) =>
  s.familiars.filter((f) => f.status === "carrying" || f.status === "deliver").length;

describe("counts, and no duplicate or teleported pickups (every tick of whole games)", () => {
  it.each(LEVELS.map((l) => [l.name, l.level] as const))("%s", (_name, level) => {
    const picked = new Set<number>();
    let pickups = 0;
    let deliveries = 0;
    const final = play(level, 7, {
      tick: (s, events, before) => {
        expect(violation(s)).toBeNull();
        // Every cube is on the board, carried, or delivered: nothing appears or vanishes.
        const onBoard = s.grid.filter((c) => c !== -1 && c !== undefined).length;
        expect(onBoard + carried(s) + s.deliveredTotal).toBe(s.cubesTotal);
        expect(s.deliveredTotal).toBe(s.groups.reduce((n, g) => n + g.delivered, 0));
        for (const e of events) {
          if (e.type === "cubePickedUp") {
            // Only a cube that was on the board can be picked up, and only once.
            expect(before.grid[e.cube], "picked a cube that was not on the board").not.toBe(EMPTY);
            expect(picked.has(e.cube)).toBe(false);
            picked.add(e.cube);
            pickups++;
          } else if (e.type === "cubeDelivered") deliveries++;
        }
      },
    });
    // The run really ended (a stuck board that stayed "playing" would hide regressions).
    expect(final.status).not.toBe("playing");
    expect(deliveries).toBe(final.deliveredTotal);
    expect(pickups).toBe(final.deliveredTotal + carried(final));
  });
});

describe("win and loss are exclusive and final", () => {
  it.each(LEVELS.map((l) => [l.name, l.level] as const))("%s", (_name, level) => {
    for (const seed of [1, 2, 3]) {
      const s = play(level, seed);
      expect(s.status, `${seed}`).not.toBe("playing");
      if (s.status === "won") {
        expect(s.deliveredTotal).toBe(s.cubesTotal);
        expect(s.groups.every((g) => g.status === "completed")).toBe(true);
        expect(s.lossReason).toBeNull();
      } else if (s.status === "lost") {
        expect(s.lossReason).not.toBeNull();
        expect(s.deliveredTotal).toBeLessThan(s.cubesTotal);
      }
      if (s.status !== "playing") {
        // A finished game never changes again.
        const before = hashState(s);
        expect(step(s)).toEqual([]);
        expect(hashState(s)).toBe(before);
        expect(legalActions(s)).toEqual([]);
      }
    }
  });
});

describe("the suite reaches both outcomes (so the checks above are not vacuous)", () => {
  it("wins, slotsFull losses and deadlocks all occur", () => {
    const seen = new Set<string>();
    for (const { level } of LEVELS) {
      for (const seed of [1, 2, 3]) {
        const s = play(level, seed);
        seen.add(s.status === "lost" ? `lost:${s.lossReason}` : s.status);
      }
    }
    expect(seen).toContain("won");
    expect(seen).toContain("lost:slotsFull");
    expect(seen).toContain("lost:deadlock");
  });
});

describe("simultaneous collectors", () => {
  it("several familiars of different groups fetch at once, each with its own cube", () => {
    let mostOut = 0;
    let groupsAtOnce = 0;
    for (const { level } of LEVELS) {
      if (level.squad < 2 || level.fieldCap < 2) continue;
      play(level, 11, {
        tick: (s) => {
          const out = s.familiars.filter((f) => f.cube !== -1);
          mostOut = Math.max(mostOut, out.length);
          groupsAtOnce = Math.max(groupsAtOnce, new Set(out.map((f) => f.group)).size);
          // No two familiars ever hold the same cube.
          expect(new Set(out.map((f) => f.cube)).size).toBe(out.length);
        },
      });
    }
    expect(mostOut).toBeGreaterThanOrEqual(3);
    expect(groupsAtOnce).toBeGreaterThanOrEqual(2);
  });
});

describe("resume from a saved state", () => {
  const interesting = { carrying: 0, parked: 0, late: 0 };

  it.each(LEVELS.slice(0, 30).map((l) => [l.name, l.level] as const))(
    "%s: saved as JSON at several points (early, carrying, parked, late), each restored copy matches the live game tick by tick",
    (_name, level) => {
      const rng = createRng(99);
      const live = createCollectState(level);
      const copies: CollectState[] = [];
      let sawCarrying = false;
      let sawParked = false;
      const save = () => copies.push(fromJSON(JSON.parse(JSON.stringify(live))));
      let ticks = 0;
      for (let i = 0; i < 20_000 && live.status === "playing"; i++) {
        if (i === 2) save();
        if (!sawCarrying && carried(live) > 0) {
          sawCarrying = true;
          interesting.carrying++;
          save();
        }
        if (!sawParked && live.slots.some((x) => x !== null)) {
          sawParked = true;
          interesting.parked++;
          save();
        }
        if (ticks === 40) {
          interesting.late++;
          save();
        }
        // Every copy gets the same action choices (the rng is only consumed for `live`).
        const act = isSettled(live) || rng.next() < 0.2;
        const a = act ? choose(live, rng) : null;
        if (a) {
          apply(live, a);
          for (const c of copies) apply(c, a);
        }
        const e1 = step(live);
        ticks++;
        for (const c of copies) {
          expect(step(c)).toEqual(e1);
          expect(hashState(c)).toBe(hashState(live));
          expect(violation(c)).toBeNull();
        }
        if (isSettled(live) && legalActions(live).length === 0) break;
      }
      expect(copies.length).toBeGreaterThan(0);
      for (const c of copies) expect(c.status).toBe(live.status);
    },
  );

  it("the snapshots above include states with a carried cube, a parked group and a late game", () => {
    expect(interesting.carrying).toBeGreaterThan(5);
    expect(interesting.parked).toBeGreaterThan(5);
    expect(interesting.late).toBeGreaterThan(5);
  });

  it("a state saved before any action, and one saved after the game ended, both restore exactly", () => {
    const fresh = createCollectState(fixtureB());
    expect(hashState(fromJSON(JSON.parse(JSON.stringify(fresh))))).toBe(hashState(fresh));
    const over = play(fixtureB(), 5);
    expect(over.status).not.toBe("playing");
    const back = fromJSON(JSON.parse(JSON.stringify(over)));
    expect(hashState(back)).toBe(hashState(over));
    expect(back.status).toBe(over.status);
    expect(back.lossReason).toBe(over.lossReason);
  });

  it("a corrupted save is refused rather than played", () => {
    const j = JSON.parse(JSON.stringify(createCollectState(fixtureB()))) as Record<string, unknown>;
    delete j.groups;
    expect(() => fromJSON(j)).toThrow();
    expect(() => fromJSON(null)).toThrow();
    expect(() => fromJSON("nope")).toThrow();
  });
});

describe("deterministic replay", () => {
  it.each(LEVELS.slice(0, 24).map((l) => [l.name, l.level] as const))(
    "%s: the action log of a played session replays to the same state and events",
    (_name, level) => {
      const rng = createRng(5);
      const session = new CollectSession(level);
      const events: CollectEvent[] = [];
      session.subscribe((b) => events.push(...b.events));
      for (let i = 0; i < 20_000 && session.state.status === "playing"; i++) {
        if (isSettled(session.state) || rng.next() < 0.2) {
          const a = choose(session.state as CollectState, rng);
          if (a) session.tap(a);
        }
        if (session.tick() === null && legalActions(session.state as CollectState).length === 0)
          break;
      }
      const r = replay(level, session.log);
      expect(hashState(r.state)).toBe(hashState(session.state as CollectState));
      expect(r.events).toEqual(events);
    },
  );
});

describe("Undo and boosters keep the game exact", () => {
  it("Undo is exact: a, b, undo, c equals a, c", () => {
    let checked = 0;
    for (const { level } of LEVELS) {
      const a = new CollectSession(level);
      const b = new CollectSession(level);
      const settle = (s: CollectSession) => {
        for (let i = 0; i < 5_000 && s.tick() !== null; i++) {
          /* run */
        }
      };
      const first = legalActions(a.state as CollectState)[0];
      if (!first) continue;
      a.tap(first);
      b.tap(first);
      settle(a);
      settle(b);
      const legal = legalActions(a.state as CollectState);
      if (legal.length < 2) continue;
      // a: take a move then undo it; b: never took it.
      a.tap(legal[0]!);
      expect(a.undo()).toBe(true);
      expect(hashState(a.state as CollectState)).toBe(hashState(b.state as CollectState));
      a.tap(legal[1]!);
      b.tap(legal[1]!);
      settle(a);
      settle(b);
      expect(hashState(a.state as CollectState)).toBe(hashState(b.state as CollectState));
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("an Extra Slot taken at the start equals a level built with one more slot", () => {
    for (const { level } of LEVELS.slice(0, 20)) {
      const withSlot = new CollectSession(level);
      withSlot.addSlot();
      const built = new CollectSession({ ...level, slots: level.slots + 1 });
      expect(hashState(withSlot.state as CollectState)).toBe(
        hashState(built.state as CollectState),
      );
      const rng = createRng(3);
      for (let i = 0; i < 3_000 && withSlot.state.status === "playing"; i++) {
        const a = choose(withSlot.state as CollectState, rng);
        if (a && (isSettled(withSlot.state) || rng.next() < 0.2)) {
          withSlot.tap(a);
          built.tap(a);
        }
        withSlot.tick();
        built.tick();
        expect(hashState(withSlot.state as CollectState)).toBe(
          hashState(built.state as CollectState),
        );
      }
    }
  });

  it("Undo is exact in the middle of a game too: familiars out, cubes carried, groups parked", () => {
    let checked = 0;
    let carriedAtTap = 0;
    for (const { level } of LEVELS) {
      const rng = createRng(21);
      const session = new CollectSession(level);
      for (let i = 0; i < 400 && session.state.status === "playing"; i++) {
        const legal = legalActions(session.state as CollectState);
        const midFlight = !isSettled(session.state) && legal.length > 0;
        if (midFlight && rng.next() < 0.5) {
          const before = hashState(session.state as CollectState);
          if (carried(session.state as CollectState) > 0) carriedAtTap++;
          session.tap(legal[rng.int(0, legal.length - 1)]!);
          for (let k = 0; k < 6; k++) session.tick();
          expect(session.undo()).toBe(true);
          expect(hashState(session.state as CollectState)).toBe(before);
          expect(violation(session.state as CollectState)).toBeNull();
          checked++;
        } else if (isSettled(session.state) && legal.length > 0) {
          session.tap(legal[rng.int(0, legal.length - 1)]!);
        }
        if (session.tick() === null && legal.length === 0) break;
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(carriedAtTap).toBeGreaterThan(3);
  });

  it("an Extra Slot taken mid-game equals a level built with it, from there to the end", () => {
    let checked = 0;
    for (const { level } of LEVELS.slice(0, 30)) {
      const rng = createRng(8);
      const withSlot = new CollectSession(level);
      const built = new CollectSession({ ...level, slots: level.slots + 1 });
      let added = false;
      for (let i = 0; i < 3_000 && withSlot.state.status === "playing"; i++) {
        if (!added && i === 12 && isSettled(withSlot.state) === false) {
          expect(withSlot.addSlot()).toBe(true);
          added = true;
          checked++;
        }
        const a = choose(withSlot.state as CollectState, rng);
        if (a && (isSettled(withSlot.state) || rng.next() < 0.2)) {
          withSlot.tap(a);
          built.tap(a);
        }
        withSlot.tick();
        built.tick();
        if (added) {
          expect(hashState(withSlot.state as CollectState)).toBe(
            hashState(built.state as CollectState),
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(3);
  });
});
