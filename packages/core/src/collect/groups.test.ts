import { describe, expect, it } from "vitest";
import { createRng } from "../rng";
import { apply, legalActions, type Action } from "./actions";
import type { CollectEvent } from "./events";
import { board, fixtureB, randomLevel } from "./fixtures";
import { groupViews, remaining, uncommitted } from "./groups";
import { violation } from "./invariants";
import { validateCollectLevel } from "./level";
import { isSettled, runUntilSettled, step } from "./sim";
import { createCollectState, type CollectState } from "./state";

const select = (column: number): Action => ({ kind: "select", column });
const resume = (slot: number): Action => ({ kind: "resume", slot });

/** 7 purple cubes on the bottom row, 5 more sealed in behind blue: Purple 12 can reach only 7. */
const purple12 = () =>
  board(["BBBBBBB", "BPPPPPB", "BBBBBBB", "PPPPPPP"], [[["P", 12]], [["B", 16]]], {
    colors: "BP",
    slots: 2,
    squad: 3,
    spawnGap: 1,
  });

describe("group capacity is real (GAME_DESIGN_V2 §5)", () => {
  it("Purple 12 with 7 reachable delivers 7, waits showing 5, then delivers exactly 5 more", () => {
    const s = createCollectState(purple12());
    expect(s.groups[0]).toMatchObject({ capacity: 12, delivered: 0 });
    apply(s, select(0));
    const ev = runUntilSettled(s);
    const g = s.groups[0]!;
    expect(g).toMatchObject({ status: "waiting", delivered: 7, committed: 0 });
    expect(remaining(g)).toBe(5);
    expect(s.familiars).toEqual([]); // no phantom collectors left behind
    expect(ev.filter((e) => e.type === "cubeDelivered")).toHaveLength(7);
    expect(ev.at(-1)).toEqual({ type: "groupParked", group: 0, slot: 0, remaining: 5 });
    // The 5 hidden purples were not touched.
    expect(s.grid.filter((c) => c === 1)).toHaveLength(5);

    // It cannot resume while its cubes are still buried.
    expect(legalActions(s)).toEqual([select(1)]);
    apply(s, select(1));
    runUntilSettled(s);
    expect(s.groups[1]!.status).toBe("completed");
    expect(legalActions(s)).toEqual([resume(0)]);

    apply(s, resume(0));
    const ev2 = runUntilSettled(s);
    expect(s.groups[0]).toMatchObject({ status: "completed", delivered: 12, committed: 0 });
    expect(s.status).toBe("won");
    expect(ev2.filter((e) => e.type === "cubeDelivered")).toHaveLength(5);
    expect(s.slots).toEqual([null, null]);
  });

  it("a group never takes more than its capacity when more cubes are reachable", () => {
    // 15 purple, all reachable: P:12 takes exactly 12; the other 3 belong to P:3.
    const level = board(["PPPPPPPPPPPPPPP"], [[["P", 12]], [["P", 3]]], {
      colors: "P",
      slots: 2,
      squad: 6,
      spawnGap: 1,
    });
    const s = createCollectState(level);
    apply(s, select(0));
    // With six familiars out at once, the group must still stop at 12.
    let peak = 0;
    while (!isSettled(s)) {
      step(s);
      expect(violation(s)).toBeNull();
      peak = Math.max(peak, s.groups[0]!.delivered + s.groups[0]!.committed);
    }
    expect(peak).toBe(12);
    expect(s.groups[0]).toMatchObject({ status: "completed", delivered: 12 });
    expect(s.grid.filter((c) => c === 0)).toHaveLength(3);
    apply(s, select(1));
    runUntilSettled(s);
    expect(s.status).toBe("won");
    expect(s.groups[1]!.delivered).toBe(3);
  });

  it("the shown number drops only on delivery, one at a time", () => {
    const s = createCollectState(purple12());
    apply(s, select(0));
    const seen: number[] = [remaining(s.groups[0]!)];
    while (!isSettled(s)) {
      step(s);
      const now = remaining(s.groups[0]!);
      if (now !== seen.at(-1)) {
        expect(now).toBe(seen.at(-1)! - 1);
        seen.push(now);
      }
    }
    expect(seen).toEqual([12, 11, 10, 9, 8, 7, 6, 5]);
  });

  it("uncommitted plus committed plus delivered is always the capacity", () => {
    const s = createCollectState(purple12());
    apply(s, select(0));
    while (!isSettled(s)) {
      step(s);
      const g = s.groups[0]!;
      expect(uncommitted(g) + g.committed + g.delivered).toBe(g.capacity);
      expect(uncommitted(g)).toBeGreaterThanOrEqual(0);
    }
  });

  it("parks with the exact remaining number in the event", () => {
    const s = createCollectState(fixtureB());
    apply(s, select(0));
    const ev = runUntilSettled(s);
    expect(ev.at(-1)).toEqual({ type: "groupParked", group: 0, slot: 0, remaining: 1 });
  });
});

describe("group views", () => {
  it("describes queued, working, waiting and completed groups for the renderer", () => {
    const s = createCollectState(fixtureB());
    expect(groupViews(s)).toEqual([
      {
        id: 0,
        color: 1,
        remaining: 2,
        capacity: 2,
        status: "queued",
        column: 0,
        slot: null,
        depth: 0,
        familiars: 0,
      },
      {
        id: 1,
        color: 2,
        remaining: 2,
        capacity: 2,
        status: "queued",
        column: 1,
        slot: null,
        depth: 0,
        familiars: 0,
      },
      {
        id: 2,
        color: 0,
        remaining: 16,
        capacity: 16,
        status: "queued",
        column: 2,
        slot: null,
        depth: 0,
        familiars: 0,
      },
    ]);
    apply(s, select(0));
    step(s);
    expect(groupViews(s)[0]).toMatchObject({
      status: "working",
      column: null,
      slot: null,
      familiars: 1,
    });
    runUntilSettled(s);
    expect(groupViews(s)[0]).toMatchObject({
      status: "waiting",
      slot: 0,
      remaining: 1,
      familiars: 0,
    });
    apply(s, select(2));
    runUntilSettled(s);
    apply(s, resume(0));
    runUntilSettled(s);
    expect(groupViews(s)[0]).toMatchObject({ status: "completed", slot: null, remaining: 0 });
  });

  it("reports depth within a column", () => {
    const level = board(
      ["RGB"],
      [
        [
          ["R", 1],
          ["G", 1],
          ["B", 1],
        ],
      ],
      { colors: "RGB" },
    );
    const views = groupViews(createCollectState(level));
    expect(views.map((v) => v.depth)).toEqual([0, 1, 2]);
    expect(views.every((v) => v.column === 0)).toBe(true);
  });
});

describe("shown numbers across random games (regression for inconsistent counts)", () => {
  function eventsOf(level: Parameters<typeof createCollectState>[0], seed: number) {
    const rng = createRng(seed);
    const s = createCollectState(level);
    const all: CollectEvent[] = [];
    for (let i = 0; i < 20_000 && s.status === "playing"; i++) {
      if (isSettled(s) || rng.next() < 0.15) {
        const legal = legalActions(s);
        if (legal.length > 0) all.push(...apply(s, legal[rng.int(0, legal.length - 1)]!));
      }
      all.push(...step(s));
    }
    return { s, all };
  }

  it("each group's number only ever goes down by one per delivery and parks report it exactly", () => {
    let parks = 0;
    let resumes = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const level = randomLevel(seed, true);
      if (!level || validateCollectLevel(level).length > 0) continue;
      const { s, all } = eventsOf(level, 9000 + seed);
      const last = new Map<number, number>(s.groups.map((g) => [g.id, g.capacity]));
      for (const e of all) {
        if (e.type === "cubeDelivered") {
          expect(e.remaining, `seed ${seed}`).toBe(last.get(e.group)! - 1);
          last.set(e.group, e.remaining);
        } else if (e.type === "groupParked") {
          expect(e.remaining, `seed ${seed}`).toBe(last.get(e.group));
          expect(e.remaining).toBeGreaterThan(0);
          parks++;
        } else if (e.type === "groupResumed") resumes++;
      }
      // A completed group ended at zero; a lost or won game leaves no negative numbers.
      for (const g of s.groups) {
        expect(remaining(g)).toBeGreaterThanOrEqual(0);
        if (g.status === "completed") expect(remaining(g)).toBe(0);
      }
    }
    expect(parks).toBeGreaterThan(50);
    expect(resumes).toBeGreaterThan(10);
  });

  it("never leaves a collector behind for a parked, completed or queued group", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const level = randomLevel(seed, true);
      if (!level || validateCollectLevel(level).length > 0) continue;
      const rng = createRng(seed);
      const s: CollectState = createCollectState(level);
      for (let i = 0; i < 20_000 && s.status === "playing"; i++) {
        if (isSettled(s) || rng.next() < 0.2) {
          const legal = legalActions(s);
          if (legal.length > 0) apply(s, legal[rng.int(0, legal.length - 1)]!);
        }
        step(s);
        for (const f of s.familiars) {
          expect(s.groups[f.group]!.status, `seed ${seed} tick ${s.tick}`).toBe("working");
        }
      }
    }
  });
});
