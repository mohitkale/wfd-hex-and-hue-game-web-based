import { describe, expect, it } from "vitest";
import { apply, legalActions, type Action } from "./actions";
import { addSlot, canAddSlot } from "./boosters";
import { board, fixtureA, fixtureB, randomLevel } from "./fixtures";
import { hintFor } from "./hint";
import { CollectSession } from "./session";
import { isSettled, runUntilSettled } from "./sim";
import { CollectSolver } from "./solver";
import { cloneState, createCollectState, hashState } from "./state";

const select = (column: number): Action => ({ kind: "select", column });

/** Fixture B played into its `slotsFull` loss (tick 10). */
function lostB() {
  const s = createCollectState(fixtureB());
  apply(s, select(0));
  runUntilSettled(s);
  apply(s, select(1));
  runUntilSettled(s);
  expect(s.lossReason).toBe("slotsFull");
  return s;
}

describe("Extra Slot (addSlot)", () => {
  it("adds one empty slot and says so", () => {
    const s = createCollectState(fixtureB());
    const events = addSlot(s);
    expect(s.slots).toEqual([null, null]);
    expect(s.params.slots).toBe(2);
    expect(events).toEqual([{ type: "slotAdded", slot: 1 }]);
  });

  it("does nothing once the game is won", () => {
    const s = createCollectState(fixtureA());
    apply(s, select(0));
    runUntilSettled(s);
    apply(s, select(1));
    runUntilSettled(s);
    expect(s.status).toBe("won");
    expect(canAddSlot(s)).toBe(false);
    expect(addSlot(s)).toEqual([]);
    expect(s.slots).toHaveLength(2);
  });

  it("revives a slotsFull loss: the stalled group parks in the new slot and the level can be won", () => {
    const s = lostB();
    const tick = s.tick;
    const events = addSlot(s);
    expect(s.status).toBe("playing");
    expect(s.lossReason).toBeNull();
    expect(s.tick).toBe(tick);
    expect(events.map((e) => e.type)).toEqual(["slotAdded", "groupParked"]);
    expect(s.slots).toEqual([0, 1]);
    expect(s.groups[1]).toMatchObject({ status: "waiting" });
    // Clearing the blue frees both reds and greens: the level is still winnable.
    apply(s, select(2));
    runUntilSettled(s);
    expect(s.status).toBe("playing");
    while (s.status === "playing" && legalActions(s).length > 0) {
      apply(s, legalActions(s)[0]!);
      runUntilSettled(s);
    }
    expect(s.status).toBe("won");
  });

  it("is the same state as having had the slot all along", () => {
    const revived = lostB();
    addSlot(revived);
    const direct = createCollectState({ ...fixtureB(), slots: 2 });
    apply(direct, select(0));
    runUntilSettled(direct);
    apply(direct, select(1));
    runUntilSettled(direct);
    expect(direct.status).toBe("playing");
    expect(hashState(revived)).toBe(hashState(direct));
  });

  it("does not revive a deadlock (a slot cannot undo it)", () => {
    const level = board(["XXXXX", "X.Y.X", "XXXXX"], [[["Y", 1]], [["X", 12]]], {
      colors: "XY",
      slots: 1,
    });
    const s = createCollectState(level);
    apply(s, select(1));
    runUntilSettled(s);
    // Y is sealed inside the blue: after the blue is gone it is reachable, so craft the deadlock by hand.
    const dead = cloneState(s);
    dead.status = "lost";
    dead.lossReason = "deadlock";
    addSlot(dead);
    expect(dead.status).toBe("lost");
    expect(dead.lossReason).toBe("deadlock");
  });
});

describe("CollectSession boosters", () => {
  const settle = (session: CollectSession) => {
    for (let i = 0; i < 5_000 && session.tick() !== null; i++) {
      /* run */
    }
  };

  it("Undo restores the state before the last select/resume, one step per use", () => {
    const session = new CollectSession(fixtureB());
    const before = hashState(session.state);
    session.tap(select(0));
    settle(session);
    const afterFirst = hashState(session.state);
    session.tap(select(1));
    settle(session);
    expect(session.state.status).toBe("lost");
    expect(session.undo()).toBe(true);
    // Back before the second select: the settled state after the first.
    expect(session.state.status).toBe("playing");
    expect(session.log).toHaveLength(1);
    expect(session.undo()).toBe(true);
    expect(hashState(session.state)).toBe(before);
    expect(session.undo()).toBe(false);
    expect(afterFirst).not.toBe(before);
  });

  it("an extra slot is kept through Undo, but Retry starts without it (M15.13)", () => {
    const session = new CollectSession(fixtureB());
    session.tap(select(0));
    settle(session);
    expect(session.addSlot()).toBe(true);
    expect(session.extraSlots).toBe(1);
    expect(session.state.slots).toHaveLength(2);
    session.undo();
    expect(session.state.slots).toHaveLength(2);
    session.restart();
    // A fresh attempt: nothing bought for the last one carries over.
    expect(session.state.slots).toEqual([null]);
    expect(session.extraSlots).toBe(0);
  });

  it("an extra slot after a loss revives it, and Undo then goes back before the losing tap", () => {
    const session = new CollectSession(fixtureB());
    const events: string[] = [];
    session.subscribe((b) => events.push(...b.events.map((e) => e.type)));
    session.tap(select(0));
    settle(session);
    session.tap(select(1));
    settle(session);
    expect(session.state.status).toBe("lost");
    expect(session.addSlot()).toBe(true);
    expect(session.state.status).toBe("playing");
    expect(events).toContain("slotAdded");
    session.undo();
    expect(session.state.status).toBe("playing");
    expect(session.state.slots).toHaveLength(2);
  });

  it("refuses an extra slot on a won game", () => {
    const session = new CollectSession(fixtureA());
    session.tap(select(0));
    settle(session);
    session.tap(select(1));
    settle(session);
    expect(session.state.status).toBe("won");
    expect(session.addSlot()).toBe(false);
    expect(session.extraSlots).toBe(0);
  });

  it("an extra slot never changes the engine's determinism: same taps, same hash", () => {
    const run = () => {
      const s = new CollectSession(fixtureB());
      s.tap(select(0));
      settle(s);
      s.addSlot();
      s.tap(select(1));
      settle(s);
      return hashState(s.state);
    };
    expect(run()).toBe(run());
  });
});

describe("Hint", () => {
  it("suggests a move that keeps the level winnable, on random levels", () => {
    let checked = 0;
    for (let seed = 1; seed <= 60 && checked < 12; seed++) {
      const level = randomLevel(seed);
      if (!level) continue;
      const state = createCollectState(level);
      const hint = hintFor(level, state, 3_000);
      if (hint.kind !== "move") continue;
      checked++;
      const next = cloneState(state);
      apply(next, hint.action);
      runUntilSettled(next);
      expect(next.status === "won" || hintFor(level, next, 3_000).kind !== "doomed").toBe(true);
    }
    expect(checked).toBeGreaterThan(3);
  });

  it("says doomed for a state no play can win, agreeing with the solver", () => {
    let found = 0;
    for (let seed = 1; seed <= 200 && found < 2; seed++) {
      const level = randomLevel(seed, true);
      if (!level) continue;
      const root = createCollectState(level);
      for (const action of legalActions(root)) {
        const t = cloneState(root);
        apply(t, action);
        runUntilSettled(t);
        if (t.status !== "playing") continue;
        const hint = hintFor(level, t, 3_000);
        if (hint.kind !== "doomed") continue;
        found++;
        expect(new CollectSolver(level, 3_000).solveState(t).status).toBe("unsolvable");
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it("says over when the game has ended", () => {
    expect(hintFor(fixtureB(), lostB())).toEqual({ kind: "over" });
  });

  it("reports unknown, never a guess, when the budget is too small", () => {
    const level = board(
      ["RGBRGBRGB", "GBRGBRGBR", "BRGBRGBRG", "RGBRGBRGB"],
      [
        [
          ["R", 4],
          ["G", 4],
        ],
        [
          ["B", 4],
          ["R", 4],
        ],
        [
          ["G", 4],
          ["B", 4],
        ],
      ],
      { colors: "RGB", slots: 2 },
    );
    expect(hintFor(level, createCollectState(level), 1)).toEqual({ kind: "unknown" });
  });

  it("accounts for extra slots", () => {
    const level = fixtureB();
    const s = createCollectState(level);
    addSlot(s);
    expect(isSettled(s)).toBe(true);
    // With two slots the opening is winnable, and the hint names a legal first move.
    const hint = hintFor(level, s);
    expect(hint.kind).toBe("move");
    if (hint.kind === "move") expect(legalActions(s)).toContainEqual(hint.action);
  });
});
