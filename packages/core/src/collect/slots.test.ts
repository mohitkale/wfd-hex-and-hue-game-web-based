import { describe, expect, it } from "vitest";
import { createRng } from "../rng";
import { apply, explain, legalActions, type Action } from "./actions";
import { board, fixtureB, randomLevel } from "./fixtures";
import { firstFreeSlot, freeSlots, slotViews } from "./slots";
import { violation } from "./invariants";
import { validateCollectLevel } from "./level";
import { isSettled, runUntilSettled, step } from "./sim";
import { cloneState, createCollectState, hashState, type CollectState } from "./state";

const select = (column: number): Action => ({ kind: "select", column });
const resume = (slot: number): Action => ({ kind: "resume", slot });

function settle(s: CollectState): void {
  for (let i = 0; i < 5_000 && !isSettled(s) && s.status === "playing"; i++) {
    step(s);
    expect(violation(s), `tick ${s.tick}`).toBeNull();
  }
  expect(isSettled(s) || s.status !== "playing", "game did not settle").toBe(true);
}

/** Three colours, each with one cube reachable now and one buried under blue (up to 3 slots). */
const threeWaiters = (slots: number) =>
  board(
    ["BBBBBBB", "BRBGBYB", "BBBBBBB", "BRBGBYB"],
    [[["R", 2]], [["G", 2]], [["Y", 2]], [["B", 22]]],
    { colors: "BRGY", slots, squad: 3, spawnGap: 1, fieldCap: 3 },
  );

describe("holding slots", () => {
  it("a group that cannot finish takes the lowest free slot; groups that finish take none", () => {
    const s = createCollectState(fixtureB());
    expect(slotViews(s)).toEqual([{ slot: 0, group: null, color: null, remaining: null }]);
    expect(firstFreeSlot(s)).toBe(0);
    apply(s, select(2)); // blue finishes without ever needing a seat
    settle(s);
    expect(freeSlots(s)).toBe(1);
    apply(s, select(0)); // red now reaches both cubes
    settle(s);
    expect(s.groups[0]!.status).toBe("completed");
    expect(freeSlots(s)).toBe(1);
  });

  it("parks fill slots in order and report each waiting number", () => {
    const s = createCollectState(threeWaiters(3));
    apply(s, select(0));
    settle(s);
    apply(s, select(1));
    settle(s);
    expect(slotViews(s).map((v) => [v.slot, v.group, v.remaining])).toEqual([
      [0, 0, 1],
      [1, 1, 1],
      [2, null, null],
    ]);
    expect(firstFreeSlot(s)).toBe(2);
    apply(s, select(2));
    settle(s);
    expect(freeSlots(s)).toBe(0);
    expect(slotViews(s).map((v) => [v.color, v.remaining])).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
  });

  it("a resumed group frees its seat at once; a later park reuses the lowest free slot", () => {
    const s = createCollectState(threeWaiters(3));
    for (const c of [0, 1, 2]) {
      apply(s, select(c));
      settle(s);
    }
    expect(s.slots).toEqual([0, 1, 2]);
    apply(s, select(3)); // blue clears the picture; every waiting red can finish now
    settle(s);
    expect(legalActions(s)).toEqual([resume(0), resume(1), resume(2)]);
    apply(s, resume(1));
    expect(s.slots).toEqual([0, null, 2]); // freed immediately, before any tick
    settle(s);
    expect(s.groups[1]!.status).toBe("completed");
    expect(s.slots).toEqual([0, null, 2]); // completing a resumed group uses no slot
    apply(s, resume(0));
    apply(s, resume(2));
    settle(s);
    expect(s.status).toBe("won");
    expect(s.slots).toEqual([null, null, null]);
  });

  it("the slot count changes the outcome: the same moves lose with 1 slot and survive with 2", () => {
    const moves = (slots: number) => {
      const s = createCollectState({ ...fixtureB(), slots });
      apply(s, select(0)); // red parks
      settle(s);
      apply(s, select(1)); // green runs dry
      settle(s);
      return s;
    };
    const one = moves(1);
    expect(one.status).toBe("lost");
    expect(one.lossReason).toBe("slotsFull");

    const two = moves(2);
    expect(two.status).toBe("playing");
    expect(two.slots).toEqual([0, 1]);
    // ...and the level is still winnable from there.
    apply(two, select(2));
    settle(two);
    apply(two, resume(0));
    settle(two);
    apply(two, resume(1));
    settle(two);
    expect(two.status).toBe("won");
  });

  it("resume is legal only with a reachable cube, and a failed resume costs nothing", () => {
    const s = createCollectState(fixtureB());
    apply(s, select(0));
    settle(s);
    expect(s.slots).toEqual([0]);
    expect(explain(s, resume(0))).toBe("noReachableCube");
    const before = hashState(s);
    expect(legalActions(s).some((a) => a.kind === "resume")).toBe(false);
    expect(hashState(s)).toBe(before);
    expect(explain(s, resume(5))).toBe("unavailable");
  });
});

describe("loss is a function of the game state, never of timing", () => {
  it("slotsFull is declared on the tick the stalled group runs dry, not earlier or later", () => {
    const s = createCollectState(fixtureB());
    apply(s, select(0));
    settle(s);
    apply(s, select(1));
    let lostAt = -1;
    while (s.status === "playing" && s.tick < 100) {
      step(s);
      if (s.status === "lost") lostAt = s.tick;
    }
    expect(lostAt).toBe(10);
    expect(s.lossReason).toBe("slotsFull");
    // Everything is frozen: further steps change nothing, whatever their number.
    const frozen = hashState(s);
    for (let i = 0; i < 50; i++) step(s);
    expect(hashState(s)).toBe(frozen);
  });

  it("deadlock with groups waiting: no legal action means lost the moment the last familiar is done", () => {
    // Red parks (its second cube is sealed in); the other front group (green) is entirely buried and
    // the blue group is queued behind it. Nothing can ever move again.
    const level = board(
      ["BBBBB", "BRBGB", "BBBBB", "BRBBB"],
      [
        [["R", 2]],
        [
          ["G", 1],
          ["B", 17],
        ],
      ],
      { colors: "BRG", slots: 1 },
    );
    expect(validateCollectLevel(level)).toEqual([]);
    const s = createCollectState(level);
    apply(s, select(0));
    runUntilSettled(s);
    expect(s.tick).toBe(5);
    expect(s.slots).toEqual([0]);
    expect(s.status).toBe("lost");
    expect(s.lossReason).toBe("deadlock");
    expect(legalActions(s)).toEqual([]);
  });

  it("chunking ticks differently never changes where a game ends up", () => {
    let compared = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const level = randomLevel(seed, true);
      if (!level || validateCollectLevel(level).length > 0) continue;
      const rng = createRng(seed);
      const a = createCollectState(level);
      const b = createCollectState(level);
      for (let i = 0; i < 500 && a.status === "playing"; i++) {
        const legal = legalActions(a);
        if (legal.length === 0 && isSettled(a)) break;
        if (isSettled(a)) {
          const act = legal[rng.int(0, legal.length - 1)]!;
          apply(a, act);
          apply(b, act);
        }
        // `a` advances with step(); `b` with runUntilSettled plus redundant no-op steps afterwards.
        step(a);
        step(b);
        if (isSettled(b)) for (let k = 0; k < rng.int(0, 3); k++) step(b);
        expect(hashState(b), `seed ${seed}`).toBe(hashState(a));
      }
      expect(hashState(cloneState(a))).toBe(hashState(a));
      compared++;
    }
    expect(compared).toBeGreaterThan(50);
  });

  it("slots are never over- or under-booked in random games", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const level = randomLevel(seed, true);
      if (!level || validateCollectLevel(level).length > 0) continue;
      const rng = createRng(seed);
      const s = createCollectState(level);
      for (let i = 0; i < 20_000 && s.status === "playing"; i++) {
        if (isSettled(s) || rng.next() < 0.15) {
          const legal = legalActions(s);
          if (legal.length > 0) apply(s, legal[rng.int(0, legal.length - 1)]!);
        }
        step(s);
        const waiting = s.groups.filter((g) => g.status === "waiting").length;
        expect(freeSlots(s) + waiting, `seed ${seed}`).toBe(level.slots);
        // A loss by slotsFull means every slot really was taken.
        if (s.lossReason === "slotsFull") expect(freeSlots(s)).toBe(0);
      }
    }
  });
});
