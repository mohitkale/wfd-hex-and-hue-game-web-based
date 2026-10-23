import { describe, expect, it } from "vitest";
import { apply, legalActions, type Action } from "./actions";
import { board, fixtureA, fixtureB, randomLevel } from "./fixtures";
import { validateCollectLevel, type CollectLevel } from "./level";
import { SCORE_SPEC, UNSCORED, difficultyScore, measureLevel, type Measures } from "./measures";
import { replayLine, solve } from "./solver";
import { runUntilSettled } from "./sim";
import { cloneState, createCollectState, type CollectState } from "./state";
import { bruteSolve } from "./testing";

/** M12.4: the decision measures against an independent exhaustive oracle, and the score's components. */

const settle = (s: CollectState, a: Action): CollectState => {
  const n = cloneState(s);
  apply(n, a);
  runUntilSettled(n);
  return n;
};

/** Memo-less exhaustive "can this settled state still be won" (tiny levels only). */
function winnable(s: CollectState): boolean {
  if (s.status === "won") return true;
  if (s.status === "lost") return false;
  return legalActions(s).some((a) => winnable(settle(s, a)));
}

/** The decision measures recomputed from scratch with the oracle, along the solver's stored line. */
function oracle(level: CollectLevel) {
  const line = solve(level).line!;
  let s = createCollectState(level);
  let alternatives = 0;
  let doomedAlt = 0;
  let tempting = 0;
  let freeSteps = 0;
  let branching = 0;
  let effective = 0;
  for (const action of line) {
    const legal = legalActions(s);
    const own = settle(s, action);
    let good = 0;
    let stepDoomed = 0;
    for (const a of legal) {
      const isLine = JSON.stringify(a) === JSON.stringify(action);
      const n = isLine ? own : settle(s, a);
      const ok = winnable(n);
      if (ok) good++;
      if (!isLine) {
        alternatives++;
        if (!ok) {
          doomedAlt++;
          stepDoomed++;
          if (n.deliveredTotal >= own.deliveredTotal) tempting++;
        }
      }
    }
    branching += legal.length;
    effective += good;
    if (stepDoomed === 0) freeSteps++;
    s = own;
  }
  const root = createCollectState(level);
  const first = legalActions(root);
  const doomedFirst = first.filter((a) => !winnable(settle(root, a))).length;
  let minSlots = level.slots;
  for (let k = 1; k <= level.slots; k++) {
    if (bruteSolve({ ...level, slots: k }, 200_000, false).status === "solved") {
      minSlots = k;
      break;
    }
  }
  const steps = line.length;
  return {
    steps,
    deadEndShare: alternatives === 0 ? 0 : doomedAlt / alternatives,
    temptingPoorShare: alternatives === 0 ? 0 : tempting / alternatives,
    freeStepShare: steps === 0 ? 0 : freeSteps / steps,
    branching: branching / steps,
    effectiveBranching: effective / steps,
    doomedFirstShare: first.length === 0 ? 0 : doomedFirst / first.length,
    slack: level.slots - minSlots,
  };
}

const quick = { randomRuns: 20, planningMax: 3 } as const;

describe("a level with no decisions", () => {
  const level = board(["RR"], [[["R", 2]]], { colors: "R", slots: 1 });
  const m = measureLevel(level, quick)!;

  it("has no choices, no dead ends and no pressure to speak of", () => {
    expect(m).toMatchObject({
      branching: 1,
      effectiveBranching: 1,
      deadEndShare: 0,
      temptingPoorShare: 0,
      doomedFirstShare: 0,
      freeStepShare: 1,
      winningShare: 1,
      solutions: 1,
      planningDepth: 1,
      reachableLoss: false,
      recoveryDepth: 0,
      recoverableShare: 1,
      hiddenColors: 0,
      slack: 0,
      randomRate: 1,
    });
    expect(difficultyScore(m).total).toBeLessThan(15);
  });
});

describe("measures agree with an independent exhaustive oracle", () => {
  it("on 40 small random levels: dead ends, temptation, free steps, branching, opening risk and slack", () => {
    let checked = 0;
    let withDeadEnds = 0;
    for (let seed = 1; seed <= 1500 && checked < 40; seed++) {
      const level = randomLevel(seed, seed % 2 === 0);
      if (!level || validateCollectLevel(level).length > 0) continue;
      if (level.columns.reduce((n, c) => n + c.length, 0) > 5) continue;
      if (solve(level, 50_000).status !== "solved") continue;
      const got = measureLevel(level, quick)!;
      const want = oracle(level);
      expect(got.deadEndShare, `seed ${seed} deadEnd`).toBeCloseTo(want.deadEndShare, 9);
      expect(got.temptingPoorShare, `seed ${seed} tempting`).toBeCloseTo(want.temptingPoorShare, 9);
      expect(got.freeStepShare, `seed ${seed} free`).toBeCloseTo(want.freeStepShare, 9);
      expect(got.branching, `seed ${seed} branching`).toBeCloseTo(want.branching, 9);
      expect(got.effectiveBranching, `seed ${seed} effective`).toBeCloseTo(
        want.effectiveBranching,
        9,
      );
      expect(got.doomedFirstShare, `seed ${seed} doomedFirst`).toBeCloseTo(
        want.doomedFirstShare,
        9,
      );
      expect(got.slack, `seed ${seed} slack`).toBe(want.slack);
      // Every measure is a share or count within range.
      for (const key of [
        "deadEndShare",
        "temptingPoorShare",
        "freeStepShare",
        "doomedFirstShare",
        "winningShare",
        "recoverableShare",
        "slotPressure",
        "hiddenShare",
        "randomRate",
      ] as const) {
        expect(got[key]).toBeGreaterThanOrEqual(0);
        expect(got[key]).toBeLessThanOrEqual(1);
      }
      if (got.deadEndShare > 0) withDeadEnds++;
      checked++;
    }
    expect(checked).toBe(40);
    expect(withDeadEnds).toBeGreaterThanOrEqual(3); // the comparison included levels with real dead ends
  }, 120_000);

  it("a poor alternative that delivers at least as many cubes as the line's move is tempting", () => {
    let seen = 0;
    for (let seed = 1; seed <= 1500 && seen < 3; seed++) {
      const level = randomLevel(seed, true);
      if (!level || validateCollectLevel(level).length > 0) continue;
      if (level.columns.reduce((n, c) => n + c.length, 0) > 5) continue;
      if (solve(level, 50_000).status !== "solved") continue;
      const m = measureLevel(level, quick)!;
      if (m.temptingPoorShare > 0) {
        seen++;
        expect(m.deadEndShare).toBeGreaterThanOrEqual(m.temptingPoorShare); // tempting ones are a subset of poor ones
      }
    }
    expect(seen).toBeGreaterThanOrEqual(1);
  }, 120_000);
});

describe("other measures", () => {
  it("fixture A: the duration is the replayed line's ticks, at 24 ticks a second", () => {
    const level = fixtureA();
    const m = measureLevel(level, quick)!;
    const line = solve(level).line!;
    expect(m.ticks).toBe(replayLine(level, line).state.tick);
    expect(m.seconds).toBe(m.ticks / 24);
  });

  it("fixture B: slot pressure is 1 (its only slot is needed) and some cheap players lose", () => {
    const m = measureLevel(fixtureB(), quick)!;
    expect(m.slotPressure).toBe(1);
    expect(m.slack).toBe(0);
    expect(m.reachableLoss).toBe(true);
    expect(m.strategyGap).toBeGreaterThan(0);
    expect(m.hiddenColors).toBe(0);
  });

  it("a level with colours buried at the start counts them", () => {
    const buried = board(["BBB", "BRB", "BBB"], [[["B", 8]], [["R", 1]]], {
      colors: "BR",
      slots: 2,
    });
    const m = measureLevel(buried, quick)!;
    expect(m.hiddenColors).toBe(1);
    expect(m.hiddenShare).toBe(0.5);
  });

  it("an unwinnable level is not measured at all (and so never scored)", () => {
    const dead = board(
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
    expect(measureLevel(dead, quick)).toBeNull();
  });

  it("says what was cut short when a budget runs out, instead of presenting it as exact", () => {
    const m = measureLevel(fixtureB(), {
      ...quick,
      winningNodes: 1,
      solutionNodes: 1,
      planningNodes: 1,
    })!;
    expect(m.truncated).toEqual({ winningShare: true, solutions: true, planning: true });
    expect(measureLevel(fixtureB(), quick)!.truncated).toEqual({
      winningShare: false,
      solutions: false,
      planning: false,
    });
  });

  it("is deterministic", () => {
    expect(measureLevel(fixtureB(), quick)).toEqual(measureLevel(fixtureB(), quick));
  });
});

describe("the difficulty score", () => {
  const m = measureLevel(fixtureB(), quick)!;

  it("shows every component with its measure, raw value, scaling and points, and they add up", () => {
    const score = difficultyScore(m);
    expect(score.components.map((c) => c.id)).toEqual(SCORE_SPEC.map((c) => c.id));
    expect(SCORE_SPEC.reduce((n, c) => n + c.weight, 0)).toBeCloseTo(1, 12);
    for (const c of score.components) {
      expect(c.normalised).toBeGreaterThanOrEqual(0);
      expect(c.normalised).toBeLessThanOrEqual(1);
      expect(c.points).toBeCloseTo(c.normalised * c.weight * 100, 12);
      expect(c.raw).toBe(m[c.measure] as number);
    }
    expect(score.total).toBeCloseTo(
      score.components.reduce((n, c) => n + c.points, 0),
      12,
    );
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it("failure-derived measures never enter it: no component reads them, and changing them changes nothing", () => {
    for (const c of SCORE_SPEC) expect(UNSCORED, c.id).not.toContain(c.measure);
    const base = difficultyScore(m).total;
    // Vary every measure that depends on how players fail, or on how long play takes, at once.
    const failMore: Measures = {
      ...m,
      randomRate: 0,
      wins: Object.fromEntries(Object.keys(m.wins).map((k) => [k, false])) as Measures["wins"],
      strategyGap: 1,
      recoveryDepth: 9,
      recoverableShare: 0,
      reachableLoss: true,
      ticks: m.ticks * 10,
      seconds: m.seconds * 10,
    };
    const failLess: Measures = {
      ...m,
      randomRate: 1,
      wins: Object.fromEntries(Object.keys(m.wins).map((k) => [k, true])) as Measures["wins"],
      strategyGap: 0,
      recoveryDepth: 0,
      recoverableShare: 1,
      reachableLoss: false,
      ticks: 1,
      seconds: 0,
    };
    expect(difficultyScore(failMore).total).toBe(base);
    expect(difficultyScore(failLess).total).toBe(base);
  });

  it("a measure cut short by a budget is left out and the rest rescaled, never scored as maximum difficulty", () => {
    const cut: Measures = { ...m, planningDepth: 3, truncated: { ...m.truncated, planning: true } };
    const score = difficultyScore(cut);
    const planning = score.components.find((c) => c.id === "planning")!;
    expect(planning.excluded).toContain("budget");
    const others = score.components.filter((c) => !c.excluded);
    const weight = others.reduce((n, c) => n + c.weight, 0);
    expect(score.total).toBeCloseTo(others.reduce((n, c) => n + c.points, 0) / weight, 9);
    // Planning depth is a lower bound when truncated; it is never reported as unreachable (infinity).
    const real = measureLevel(fixtureB(), { ...quick, planningNodes: 1 })!;
    expect(real.truncated.planning).toBe(true);
    expect(Number.isFinite(real.planningDepth)).toBe(true);
  });

  it("a level with no decisions scores below one with real dead ends, whatever random play does", () => {
    const trivial = measureLevel(board(["RR"], [[["R", 2]]], { colors: "R", slots: 1 }), quick)!;
    let deeper: Measures | null = null;
    for (let seed = 1; seed <= 1500 && !deeper; seed++) {
      const level = randomLevel(seed, true);
      if (!level || validateCollectLevel(level).length > 0) continue;
      if (level.columns.reduce((n, c) => n + c.length, 0) > 5) continue;
      if (solve(level, 50_000).status !== "solved") continue;
      const x = measureLevel(level, quick)!;
      if (x.deadEndShare > 0.2) deeper = x;
    }
    expect(deeper).not.toBeNull();
    expect(difficultyScore(trivial).total).toBeLessThan(difficultyScore(deeper!).total);
    // Make the trivial level "fail" more by editing only the rates: still the same score.
    expect(difficultyScore({ ...trivial, randomRate: 0 }).total).toBe(
      difficultyScore(trivial).total,
    );
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------
// The remaining measures against crafted levels and independent oracles
// ---------------------------------------------------------------------------------------------

/** Independent depth-d lookahead player (the difficulty document's rule), plain recursion. */
function oracleLookahead(level: CollectLevel, depth: number): boolean {
  let s = createCollectState(level);
  for (let moves = 0; s.status === "playing" && moves < 3 * s.groups.length; moves++) {
    const legal = legalActions(s);
    if (legal.length === 0) break;
    const value = (st: CollectState, d: number): number => {
      if (st.status === "won") return Infinity;
      if (st.status === "lost") return -Infinity;
      const acts = d === 0 ? [] : legalActions(st);
      if (d === 0 || acts.length === 0)
        return st.deliveredTotal + 2 * st.slots.filter((x) => x === null).length;
      return Math.max(...acts.map((a) => value(settle(st, a), d - 1)));
    };
    let best = legal[0]!;
    let bestValue = -Infinity;
    for (const a of legal) {
      const v = value(settle(s, a), depth - 1);
      if (v > bestValue) {
        bestValue = v;
        best = a;
      }
    }
    s = settle(s, best);
  }
  return s.status === "won";
}

describe("planning depth, winning share, solutions, recovery and reachable loss", () => {
  const small = (seed: number): CollectLevel | null => {
    const level = randomLevel(seed, seed % 2 === 0);
    if (!level || validateCollectLevel(level).length > 0) return null;
    if (level.columns.reduce((n, c) => n + c.length, 0) > 5) return null;
    if (solve(level, 50_000).status !== "solved") return null;
    return level;
  };

  it("planningDepth equals the smallest depth at which an independent lookahead player wins", () => {
    let checked = 0;
    let deeper = 0;
    for (let seed = 1; seed <= 1500 && checked < 30; seed++) {
      const level = small(seed);
      if (!level) continue;
      const got = measureLevel(level, { randomRuns: 5, planningMax: 4 })!;
      let want = Infinity;
      for (let d = 1; d <= 4; d++) {
        if (oracleLookahead(level, d)) {
          want = d;
          break;
        }
      }
      expect(got.planningDepth, `seed ${seed}`).toBe(want);
      if (want > 1) deeper++;
      checked++;
    }
    expect(checked).toBe(30);
    expect(deeper).toBeGreaterThanOrEqual(1); // the comparison included levels that need planning
  }, 120_000);

  it("winningShare equals the share of non-doomed positions at depth 3, with won positions counted as not doomed", () => {
    // Seeds 396, 656 and 1446 are levels (found by search) where some depth-3 positions are doomed;
    // the others are ordinary small levels where every position is still winnable.
    const seeds = [396, 656, 1446, 3, 4, 5, 6, 7, 8, 9];
    let below = 0;
    for (const seed of seeds) {
      const level = randomLevel(seed, seed % 2 === 0);
      if (!level || validateCollectLevel(level).length > 0) continue;
      if (solve(level, 50_000).status !== "solved") continue;
      const got = measureLevel(level, { randomRuns: 5, planningMax: 1, winningNodes: 100_000 })!;
      // Independent enumeration to depth 3 (stopping early only when a depth has no non-lost node).
      let frontier: CollectState[] = [createCollectState(level)];
      let deepest: { playing: CollectState[]; won: number } = { playing: frontier, won: 0 };
      for (let depth = 1; depth <= 3; depth++) {
        const next: CollectState[] = [];
        let won = 0;
        for (const st of frontier) {
          for (const a of legalActions(st)) {
            const n = settle(st, a);
            if (n.status === "playing") next.push(n);
            else if (n.status === "won") won++;
          }
        }
        if (next.length + won === 0) break;
        deepest = { playing: next, won };
        frontier = next;
      }
      const total = deepest.playing.length + deepest.won;
      const good = deepest.won + deepest.playing.filter(winnable).length;
      const want = total === 0 ? 1 : good / total;
      expect(got.winningShare, `seed ${seed}`).toBeCloseTo(want, 9);
      if (want < 1) below++;
    }
    expect(below).toBeGreaterThanOrEqual(2);
  }, 300_000);

  it("fixture B: three kinds of winning line (nothing parks, red parks, green parks), so solutions is 3", () => {
    expect(measureLevel(fixtureB(), quick)!.solutions).toBe(3);
    expect(measureLevel(fixtureA(), quick)!.solutions).toBe(1);
  });

  it("fixture B: losses (a second park with one slot) are one action from a position that can still win", () => {
    const m = measureLevel(fixtureB(), quick)!;
    expect(m.reachableLoss).toBe(true);
    expect(m.recoveryDepth).toBeGreaterThanOrEqual(1);
    expect(m.recoveryDepth).toBeLessThanOrEqual(2);
    expect(m.recoverableShare).toBe(1);
  });

  it("reachableLoss is false when nothing can go wrong and true when a player loses", () => {
    expect(
      measureLevel(board(["RR"], [[["R", 2]]], { colors: "R", slots: 1 }), quick)!.reachableLoss,
    ).toBe(false);
    expect(measureLevel(fixtureB(), quick)!.reachableLoss).toBe(true);
  });

  it("a run that ran out of actions is not a loss for the recovery measures", () => {
    // No level here hits the cap, so check the accounting through a level with no losses at all.
    const m = measureLevel(fixtureA(), quick)!;
    expect(m.recoveryDepth).toBe(0);
    expect(m.recoverableShare).toBe(1);
  });
});
