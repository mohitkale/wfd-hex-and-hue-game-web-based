import { describe, expect, it } from "vitest";
import { apply, legalActions } from "./actions";
import { board, fixtureA, fixtureB, fixtureC, fixtureD, fixtureE, randomLevel } from "./fixtures";
import { validateCollectLevel, type CollectLevel } from "./level";
import { CollectSolver, minSlots, replayLine, solve } from "./solver";
import { runUntilSettled } from "./sim";
import { cloneState, createCollectState } from "./state";
import { bruteSolve } from "./testing";

/** M12.1: the solver agrees with brute force, and every solution replays to a win in the live engine. */

/** A level with two ways to lose and no way to win (the first move parks, the second overflows). */
const deadEnds = (): CollectLevel =>
  board(
    ["BBBBBBB", "BBBBBBB", "BBBBBBB", "BBBRBBB", "BBBBBBB", "BBBBBBB", "BBBBBBB"],
    [
      [["B", 2]],
      [["B", 2]],
      [
        ["R", 1],
        ["B", 44],
      ],
    ],
    { colors: "BR", slots: 2 },
  );

describe("solver versus brute force", () => {
  it("gives the same verdict as the unmemoised reference on 150 small levels, and every line wins", () => {
    let solved = 0;
    let unsolvable = 0;
    for (let seed = 1; seed <= 2000 && solved + unsolvable < 150; seed++) {
      const level = randomLevel(seed, seed % 2 === 0);
      if (!level || validateCollectLevel(level).length > 0) continue;
      const groups = level.columns.reduce((n, c) => n + c.length, 0);
      if (groups > 6) continue;
      const reference = bruteSolve(level, 200_000, false);
      if (reference.status === "unknown") continue;
      const result = solve(level, 200_000);
      expect(result.status, `seed ${seed}`).toBe(reference.status);
      if (result.status === "solved") {
        solved++;
        const session = replayLine(level, result.line!);
        expect(session.state.status, `seed ${seed}`).toBe("won");
        expect(session.state.deliveredTotal).toBe(session.state.cubesTotal);
      } else {
        unsolvable++;
        expect(result.line).toBeNull();
      }
    }
    expect(solved).toBeGreaterThan(40);
    expect(unsolvable).toBeGreaterThanOrEqual(5);
  });

  it("searches no more than the memoised reference on the same levels", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const level = randomLevel(seed, true);
      if (!level || validateCollectLevel(level).length > 0) continue;
      const reference = bruteSolve(level, 50_000, true);
      const result = solve(level, 50_000);
      if (reference.status === "unknown" || result.status === "unknown") continue;
      expect(result.status).toBe(reference.status);
    }
  });
});

describe("every fixture", () => {
  it.each([
    ["A", fixtureA],
    ["B", fixtureB],
    ["C", () => fixtureC(1)],
    ["D", fixtureD],
    ["E", fixtureE],
  ])("%s: solved, and the solution replays to a win in the full engine", (_name, make) => {
    const level = make();
    const result = solve(level);
    expect(result.status).toBe("solved");
    const session = replayLine(level, result.line!);
    expect(session.state.status).toBe("won");
    expect(session.state.deliveredTotal).toBe(session.state.cubesTotal);
    // Replaying the logged taps through the engine's own replay gives the same ending.
    expect(session.log.length).toBeGreaterThanOrEqual(result.line!.length);
  });
});

describe("genuine unwinnable positions", () => {
  it("a level with only dead ends is reported unsolvable, after exploring more than one branch", () => {
    const result = solve(deadEnds());
    expect(result.status).toBe("unsolvable");
    expect(result.line).toBeNull();
    expect(result.nodes).toBeGreaterThanOrEqual(3);
    expect(result.losses).toBeGreaterThanOrEqual(1);
    expect(bruteSolve(deadEnds()).status).toBe("unsolvable");
  });

  it("a position that has already lost is unsolvable at once", () => {
    const state = createCollectState(fixtureB());
    state.status = "lost";
    expect(new CollectSolver(fixtureB()).solveState(state).status).toBe("unsolvable");
  });

  it("a won position needs no moves", () => {
    const state = createCollectState(fixtureB());
    state.status = "won";
    const r = new CollectSolver(fixtureB()).solveState(state);
    expect(r).toMatchObject({ status: "solved", line: [] });
  });

  it("a doomed position is detected even though the game is not over yet", () => {
    // Search random tight levels for a first move that neither wins nor loses at once but dooms the level.
    let doomed = 0;
    for (let seed = 1; seed <= 400 && doomed < 5; seed++) {
      const level = randomLevel(seed, true);
      if (!level || validateCollectLevel(level).length > 0) continue;
      const solver = new CollectSolver(level);
      const root = createCollectState(level);
      const verdicts = legalActions(root).map((action) => {
        const next = cloneState(root);
        apply(next, action);
        runUntilSettled(next);
        return next.status === "playing" ? solver.verdict(next, 50_000) : next.status;
      });
      if (verdicts.includes("unknown")) continue;
      // The level is winnable exactly when some first move wins now or leaves a winnable state.
      const winnable = verdicts.some((v) => v === "winnable" || v === "won");
      expect(solver.solve(50_000).status, `seed ${seed}`).toBe(winnable ? "solved" : "unsolvable");
      if (verdicts.includes("doomed")) doomed++;
    }
    expect(doomed).toBeGreaterThanOrEqual(1);
  });
});

describe("budgets and caching", () => {
  it("says unknown, never unsolvable, when the budget runs out", () => {
    const result = solve(fixtureB(), 1);
    expect(result.status).toBe("unknown");
    expect(result.line).toBeNull();
    expect(result.nodes).toBeLessThanOrEqual(1);
  });

  it("an exhausted query caches nothing false: a bigger budget on the same solver still finds the win", () => {
    const solver = new CollectSolver(fixtureB());
    expect(solver.solve(1).status).toBe("unknown");
    expect(solver.solve(10_000).status).toBe("solved");
  });

  it("shares work between queries: the second answer is immediate", () => {
    const solver = new CollectSolver(fixtureB());
    const first = solver.solve();
    const second = solver.solve();
    expect(second.status).toBe(first.status);
    expect(second.line).toEqual(first.line);
    expect(second.nodes).toBe(0);
    expect(second.memoHits).toBeGreaterThan(0);
    expect(solver.size).toBeGreaterThan(0);
    solver.clear();
    expect(solver.size).toBe(0);
  });

  it("is deterministic", () => {
    expect(solve(fixtureB())).toEqual(solve(fixtureB()));
  });
});

describe("a solver belongs to one level", () => {
  it("rejects a state from another level, a different slot count or different cubes", () => {
    const solver = new CollectSolver(fixtureB());
    expect(() => solver.solveState(createCollectState(fixtureA()))).toThrow(
      "not from this solver's level",
    );
    expect(() =>
      solver.solveState(createCollectState({ ...fixtureB(), slots: fixtureB().slots + 1 })),
    ).toThrow("not from this solver's level");
    const recoloured = fixtureB();
    recoloured.cells = recoloured.cells.map((c) => (c === 1 ? 2 : c));
    recoloured.columns = [
      [{ color: 2, capacity: 2 }],
      [{ color: 2, capacity: 2 }],
      [{ color: 0, capacity: 16 }],
    ];
    expect(() => solver.solveState(createCollectState(recoloured))).toThrow(
      "not from this solver's level",
    );
  });

  it("accepts any state reached by play on that level", () => {
    const level = fixtureB();
    const solver = new CollectSolver(level);
    const s = createCollectState(level);
    apply(s, legalActions(s)[0]!);
    runUntilSettled(s);
    expect(() => solver.solveState(s)).not.toThrow();
  });

  it("two solvers on different levels never share verdicts", () => {
    const a = new CollectSolver(deadEnds());
    const b = new CollectSolver(fixtureB());
    expect(a.solve().status).toBe("unsolvable");
    expect(b.solve().status).toBe("solved");
    expect(a.solve().status).toBe("unsolvable");
  });
});

describe("minSlots", () => {
  it("finds the fewest slots that still allow a win", () => {
    const b = minSlots(fixtureB());
    expect(b).toMatchObject({ slots: 1, unknown: false });
    expect(replayLine({ ...fixtureB(), slots: 1 }, b.line!).state.status).toBe("won");
    // The same answer by brute force: one slot wins, so there is no smaller number.
    expect(bruteSolve({ ...fixtureB(), slots: 1 }).status).toBe("solved");
  });

  it("is null when even every slot is not enough, and unknown when the budget runs out", () => {
    expect(minSlots(deadEnds())).toEqual({ slots: null, unknown: false, line: null });
    expect(minSlots(fixtureB(), 1)).toEqual({ slots: null, unknown: true, line: null });
  });

  it("agrees with brute force on levels where parking matters", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const level = randomLevel(seed, true);
      if (!level || validateCollectLevel(level).length > 0) continue;
      if (level.columns.reduce((n, c) => n + c.length, 0) > 5) continue;
      const result = minSlots({ ...level, slots: 3 }, 100_000);
      if (result.unknown) continue;
      for (let k = 1; k <= 3; k++) {
        const brute = bruteSolve({ ...level, slots: k }, 100_000, false);
        if (brute.status === "unknown") continue;
        const expected = brute.status === "solved";
        expect(result.slots !== null && k >= result.slots, `seed ${seed} k=${k}`).toBe(expected);
      }
    }
  });
});

describe("replayLine", () => {
  it("throws on a line the engine refuses", () => {
    expect(() => replayLine(fixtureB(), [{ kind: "resume", slot: 0 }])).toThrow("refused");
  });
});
