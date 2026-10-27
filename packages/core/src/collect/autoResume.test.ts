import { describe, expect, it } from "vitest";
import { apply, legalActions, type Action } from "./actions";
import { autoResume, runUntilSettledAuto } from "./autoResume";
import { fixtureB, randomLevel } from "./fixtures";
import { hintFor } from "./hint";
import { CollectSession, replay } from "./session";
import { runUntilSettled } from "./sim";
import { CollectSolver, replayLine, solve } from "./solver";
import { createCollectState, hashState } from "./state";

const select = (column: number): Action => ({ kind: "select", column });
const settle = (s: CollectSession) => {
  for (let i = 0; i < 20_000 && s.tick() !== null; i++) {
    /* run */
  }
};

describe("auto-resume: a pending box goes back to work by itself", () => {
  it("without the policy a parked box waits for a tap (the free-choice rules)", () => {
    const s = new CollectSession({ ...fixtureB(), slots: 2 });
    s.tap(select(0)); // red parks: its second cube is under the blue
    settle(s);
    s.tap(select(2)); // clear the blue
    settle(s);
    expect(s.state.slots).toContain(0);
    expect(s.log.every((e) => e.auto === undefined)).toBe(true);
  });

  it("with the policy it resumes as soon as a cube it can reach appears, and the log says so", () => {
    const s = new CollectSession({ ...fixtureB(), slots: 2 }, undefined, undefined, true);
    s.tap(select(0));
    settle(s);
    expect(s.state.groups[0]!.status).toBe("waiting");
    s.tap(select(2));
    settle(s);
    // Red (group 0) went back to work and finished, with no tap from the player.
    expect(s.state.groups[0]!.status).toBe("completed");
    const auto = s.log.filter((e) => e.auto);
    expect(auto.length).toBeGreaterThan(0);
    expect(auto.every((e) => e.action.kind === "resume")).toBe(true);
    // The player's moves exclude the automatic ones.
    expect(s.moves).toBe(s.log.length - auto.length);
    expect(s.moves).toBe(2);
  });

  it("a manual resume is no longer needed (and never legal while it would be automatic)", () => {
    const s = new CollectSession({ ...fixtureB(), slots: 2 }, undefined, undefined, true);
    s.tap(select(0));
    settle(s);
    s.tap(select(2));
    settle(s);
    expect(legalActions(s.state).some((a) => a.kind === "resume")).toBe(false);
  });

  it("respects the working limit: a full field resumes nothing", () => {
    // fieldCap 1: while the blue works, the parked red may not resume even though it could reach a cube.
    const level = { ...fixtureB(), slots: 2, fieldCap: 1 };
    const s = createCollectState(level);
    apply(s, select(0));
    runUntilSettled(s);
    expect(s.groups[0]!.status).toBe("waiting");
    apply(s, select(2));
    // Run until the blue has opened the red's cube but still works: nothing may resume at that moment.
    let sawFull = false;
    for (let i = 0; i < 5_000 && s.status === "playing"; i++) {
      runUntilSettled(s, 1);
      const workingBefore = s.groups.filter((g) => g.status === "working").length;
      const applied = autoResume(s);
      if (workingBefore >= level.fieldCap) {
        sawFull = true;
        expect(applied, "resumed while the working place was full").toEqual([]);
      }
      if (applied.length > 0) break;
    }
    expect(sawFull).toBe(true);
  });

  it("is deterministic: replaying the log (automatic entries included) gives the same state", () => {
    const level = { ...fixtureB(), slots: 2 };
    const s = new CollectSession(level, undefined, undefined, true);
    s.tap(select(0));
    settle(s);
    s.tap(select(2));
    settle(s);
    const r = replay(level, s.log);
    expect(hashState(r.state)).toBe(hashState(s.state as ReturnType<typeof createCollectState>));
  });

  it("runUntilSettledAuto equals what a session does", () => {
    const level = { ...fixtureB(), slots: 2 };
    const a = createCollectState(level);
    apply(a, select(0));
    runUntilSettledAuto(a);
    apply(a, select(2));
    runUntilSettledAuto(a);
    const s = new CollectSession(level, undefined, undefined, true);
    s.tap(select(0));
    settle(s);
    s.tap(select(2));
    settle(s);
    expect(hashState(a)).toBe(hashState(s.state as ReturnType<typeof createCollectState>));
  });
});

describe("solving the game's own policy", () => {
  it("a line found under auto-resume wins when replayed with it, and has no manual resume", () => {
    let checked = 0;
    for (let seed = 1; seed <= 80 && checked < 12; seed++) {
      const level = randomLevel(seed);
      if (!level) continue;
      const r = solve(level, 5_000, true);
      if (r.status !== "solved" || !r.line) continue;
      checked++;
      expect(r.line.some((a) => a.kind === "resume")).toBe(false);
      expect(replayLine(level, r.line, true).state.status).toBe("won");
    }
    expect(checked).toBeGreaterThan(4);
  });

  it("auto-resume only removes choices: whatever it wins, free choice wins", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const level = randomLevel(seed, seed % 2 === 0);
      if (!level) continue;
      if (solve(level, 4_000, true).status === "solved") {
        expect(new CollectSolver(level, 4_000).solve().status).not.toBe("unsolvable");
      }
    }
  });

  it("the hint searches the policy too", () => {
    const level = { ...fixtureB(), slots: 2 };
    const state = createCollectState(level);
    const hint = hintFor(level, state, 3_000, true);
    expect(hint.kind).toBe("move");
  });

  it("tick() reports a batch when only an automatic resume happened (the tick did not advance)", () => {
    const s = new CollectSession({ ...fixtureB(), slots: 2 }, undefined, undefined, true);
    s.tap(select(0));
    settle(s);
    s.tap(select(2));
    // Run only until the resume appears in the log; the batch that carries it must be returned.
    let batch = null;
    for (let i = 0; i < 20_000 && !s.log.some((e) => e.auto); i++) batch = s.tick();
    expect(s.log.some((e) => e.auto)).toBe(true);
    expect(batch).not.toBeNull();
    expect(batch!.events.length).toBeGreaterThan(0);
  });

  it("undo drops the tap and the automatic resumes after it, keeps earlier ones, and replays to the live state", () => {
    const level = { ...fixtureB(), slots: 2 };
    const s = new CollectSession(level, undefined, undefined, true);
    s.tap(select(0));
    settle(s);
    s.tap(select(2)); // the blue clears; red resumes by itself
    settle(s);
    const autos = s.log.filter((e) => e.auto).length;
    expect(autos).toBeGreaterThan(0);
    expect(s.moves).toBe(2);
    s.tap(select(1));
    settle(s);
    expect(s.undo()).toBe(true);
    // The last tap and whatever followed it are gone; the earlier tap and its auto entries stay.
    expect(s.log.filter((e) => e.auto).length).toBe(autos);
    expect(s.moves).toBe(2);
    expect(hashState(replay(level, s.log).state)).toBe(hashState(s.state));
  });
});
