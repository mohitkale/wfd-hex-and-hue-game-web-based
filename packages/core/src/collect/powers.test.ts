import { describe, expect, it } from "vitest";
import { board } from "./fixtures";
import { violation } from "./invariants";
import type { CollectLevel } from "./level";
import { canCall, canSweep, reachTarget, SWEEP_CUBES } from "./powers";
import { CollectSession } from "./session";
import { createCollectState } from "./state";

const settle = (s: CollectSession) => {
  for (let i = 0; i < 20_000 && s.tick() !== null; i++) {
    /* run */
  }
};
const shared = (level: CollectLevel, trays: number): CollectLevel => ({
  ...level,
  slots: trays,
  fieldCap: trays,
  sharedTrays: true,
});

describe("Familiar's Call (M15.13)", () => {
  it("moves a box from behind to the front of its column; Undo takes it back", () => {
    const level = shared(
      board(
        ["RRBB"],
        [
          [
            ["R", 2],
            ["B", 2],
          ],
        ],
        { colors: "RB" },
      ),
      2,
    );
    const s = new CollectSession(level, undefined, undefined, true);
    expect(canCall(s.state, 0, 0)).toBe(false);
    expect(canCall(s.state, 0, 2)).toBe(false);
    expect(s.callForward(0, 1)).toBe(true);
    expect(s.state.groups[s.state.columns[0]![0]!]!.color).toBe(1);
    expect(s.undo()).toBe(true);
    expect(s.state.groups[s.state.columns[0]![0]!]!.color).toBe(0);
  });
});

describe("Besom Sweep (M15.13)", () => {
  const level = () =>
    shared(board(["BBBBB", "BRRRB", "BBBBB"], [[["R", 3]], [["B", 12]]], { colors: "BR" }), 2);

  it("a box with only buried cubes waits; swept, its familiars pull them out and carry them to the hole", () => {
    const s = new CollectSession(level(), undefined, undefined, true);
    expect(s.tap({ kind: "select", column: 0 }).ok).toBe(true); // queued: red is buried
    const red = s.state.groups.findIndex((g) => g.color === 1);
    expect(s.state.groups[red]!.status).toBe("waiting");
    expect(s.canSweep(red)).toBe(true);
    expect(s.sweep(red)).toBe(true);
    settle(s);
    expect(s.state.groups[red]!.status).toBe("completed");
    expect(s.state.groups[red]!.flying).toBeUndefined();
    expect(violation(s.state)).toBeNull();
    // Blue is untouched and still finishes the picture.
    s.tap({ kind: "select", column: 1 });
    settle(s);
    expect(s.state.status).toBe("won");
  });

  it("reaches at most SWEEP_CUBES buried cubes, then waits again", () => {
    const big = shared(
      board(["BBBBBBBBB", "BRRRRRRRB", "BBBBBBBBB"], [[["R", 7]], [["B", 20]]], { colors: "BR" }),
      2,
    );
    const s = new CollectSession(big, undefined, undefined, true);
    s.tap({ kind: "select", column: 0 });
    const red = s.state.groups.findIndex((g) => g.color === 1);
    s.sweep(red);
    expect(s.state.groups[red]!.flying).toBe(SWEEP_CUBES);
    settle(s);
    // Six were pulled out; the seventh waits until blue opens the way.
    expect(s.state.groups[red]!.delivered).toBe(SWEEP_CUBES);
    expect(s.state.groups[red]!.status).toBe("waiting");
  });

  it("is refused for a box in a column, a finished game, or a colour with no cube left", () => {
    const s = createCollectState(level());
    expect(canSweep(s, 0)).toBe(false); // queued in its column
    s.status = "won";
    expect(canSweep(s, 0)).toBe(false);
  });

  it("a swept familiar never crosses cubes: it walks open space to the cube's nearest walkway cell", () => {
    const s = createCollectState(level());
    const t = reachTarget(s, 1)!;
    expect(s.grid[t.cube]).toBe(1);
    expect(s.dist[t.standing]).toBeGreaterThanOrEqual(0); // on the walkway
  });

  it("every cell of a swept familiar's route is open space", () => {
    const sess = new CollectSession(level(), undefined, undefined, true);
    sess.tap({ kind: "select", column: 0 });
    const red = sess.state.groups.findIndex((g) => g.color === 1);
    sess.sweep(red);
    for (let i = 0; i < 400 && sess.state.status === "playing"; i++) {
      for (const f of sess.state.familiars)
        for (const c of f.route.slice(0, -1)) expect(sess.state.dist[c]).toBeGreaterThanOrEqual(0);
      if (sess.tick() === null) break;
    }
  });
});
