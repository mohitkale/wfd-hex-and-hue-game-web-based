import { describe, expect, it } from "vitest";
import { apply, applyTap, explain, explainTap, legalActions, type Action } from "./actions";
import { board, fixtureB, fixtureD } from "./fixtures";
import { CollectSession, replay } from "./session";
import { hashState } from "./state";
import { createCollectState } from "./state";
import { runUntilSettled } from "./sim";

const select = (column: number): Action => ({ kind: "select", column });
const settle = (s: CollectSession) => {
  for (let i = 0; i < 20_000 && s.tick() !== null; i++) {
    /* run */
  }
};

const createFull = () => {
  const s = createCollectState({ ...fixtureD(), slots: 1 });
  s.slots[0] = 99;
  return s;
};

describe("a tap on a box that cannot work yet queues it in a free tray (M15.11)", () => {
  it("the strict rules are unchanged: such a column is not a legal action", () => {
    const s = createCollectState({ ...fixtureD(), slots: 2 });
    // Column 0 holds the pocketed colour, walled in by the other at the start.
    expect(explain(s, select(0))).not.toBe("ok");
    expect(legalActions(s).some((a) => a.kind === "select" && a.column === 0)).toBe(false);
  });

  it("a free tray makes the tap succeed: the box waits there, then the game resumes it", () => {
    const level = { ...fixtureD(), slots: 2 };
    const s = new CollectSession(level, undefined, undefined, true);
    expect(s.check(select(0))).toBe("ok");
    const r = s.tap(select(0));
    expect(r.ok).toBe(true);
    expect(r.events.map((e) => e.type)).toEqual(["groupSelected", "groupParked"]);
    const id = s.state.slots.find((x) => x !== null)!;
    expect(s.state.groups[id]!.status).toBe("waiting");
    // The other colour clears the pocket's wall; the queued box wakes by itself.
    s.tap(select(1));
    settle(s);
    expect(s.state.groups[id]!.status).toBe("completed");
    expect(s.log.some((e) => e.auto)).toBe(true);
  });

  it("with no free tray the tap is refused with the reason it cannot work", () => {
    const s = createCollectState({ ...fixtureD(), slots: 1 });
    expect(explainTap(s, select(0))).toBe("ok");
    s.slots[0] = 99; // occupied
    expect(explainTap(s, select(0))).toBe(explain(s, select(0)));
    expect(explainTap(s, select(0))).not.toBe("ok");
  });

  it("a full working field also queues instead of refusing", () => {
    const level = { ...fixtureB(), slots: 2, fieldCap: 1 };
    const s = new CollectSession(level, undefined, undefined, true);
    expect(s.tap(select(0)).ok).toBe(true); // red is working (the one place)
    expect(explain(s.state, select(1))).toBe("fieldFull");
    expect(s.check(select(1))).toBe("ok");
    expect(s.tap(select(1)).ok).toBe(true);
    expect(s.state.slots.filter((x) => x !== null)).toHaveLength(1);
  });

  it("apply() throws for a queued tap only when no tray is free", () => {
    const s = createCollectState({ ...fixtureD(), slots: 1 });
    expect(() => apply(s, select(0))).toThrow(); // the strict rules still refuse it
    expect(() => applyTap(s, select(0))).not.toThrow();
    expect(s.slots.some((x) => x !== null)).toBe(true);
    expect(() => applyTap(createFull(), select(0))).toThrow();
  });

  it("an empty column or a finished game is never queued", () => {
    const s = createCollectState({ ...fixtureD(), slots: 2 });
    expect(explainTap(s, select(99))).toBe("unavailable");
    s.status = "lost";
    expect(explainTap(s, select(0))).toBe("gameOver");
  });

  it("undo takes a queued box back to its column", () => {
    const s = new CollectSession({ ...fixtureD(), slots: 2 }, undefined, undefined, true);
    const before = s.state.columns.map((c) => c.length);
    s.tap(select(0));
    expect(s.undo()).toBe(true);
    expect(s.state.columns.map((c) => c.length)).toEqual(before);
    expect(s.state.slots.every((x) => x === null)).toBe(true);
  });

  it("a queued tap and the automatic resumes after it replay to the very same state", () => {
    const level = { ...fixtureD(), slots: 2 };
    const s = new CollectSession(level, undefined, undefined, true);
    s.tap(select(0));
    s.tap(select(1));
    settle(s);
    expect(s.log.some((e) => e.auto)).toBe(true);
    const r = replay(level, s.log);
    expect(hashState(r.state)).toBe(hashState(s.state));
    expect(r.state.status).toBe(s.state.status);
  });

  describe("the loss rules know about queueing", () => {
    // Z walls R in; B can be collected at once. Column 0 is [R, Z], column 1 is [B].
    const walled = (slots: number) =>
      board(
        ["ZZZ.B", "ZRZ..", "ZZZ.."],
        [
          [
            ["R", 1],
            ["Z", 8],
          ],
          [["B", 1]],
        ],
        {
          colors: "ZRB",
          slots,
          squad: 1,
          spawnGap: 1,
          fieldCap: 1,
        },
      );

    it("is not a deadlock while queueing the walled box would expose a box that can work", () => {
      const s = new CollectSession(walled(3), undefined, undefined, true);
      s.tap(select(1)); // B first: afterwards nothing can work strictly
      settle(s);
      expect(s.state.status).toBe("playing");
      expect(s.tap(select(0)).ok).toBe(true); // R queues, Z is the front now
      expect(s.tap(select(0)).ok).toBe(true); // Z works; R wakes by itself once it is open
      settle(s);
      expect(s.state.status).toBe("won");
    });

    it("the strict solver rules still call that board a deadlock (they are not the player's)", () => {
      const s = createCollectState(walled(3));
      apply(s, select(1));
      runUntilSettled(s);
      expect(s.status).toBe("lost");
      expect(s.lossReason).toBe("deadlock");
    });

    it("a queued box that takes the last tray can make a dry working group lose; Undo recovers it", () => {
      const level = board(["R.ZZZ", "..ZRZ", "B.ZZZ"], [[["R", 2]], [["B", 1]], [["Z", 8]]], {
        colors: "RBZ",
        slots: 1,
        squad: 1,
        spawnGap: 1,
        fieldCap: 1,
      });
      const s = new CollectSession(level, undefined, undefined, true);
      s.tap(select(0));
      expect(s.tap(select(1)).ok).toBe(true); // queued into the only tray
      settle(s);
      expect(s.state.status).toBe("lost");
      expect(s.state.lossReason).toBe("slotsFull");
      expect(s.undo()).toBe(true);
      expect(s.state.status).toBe("playing");
    });
  });
});
