import { describe, expect, it } from "vitest";
import { apply, legalActions, type Action } from "./actions";
import { board, fixtureA, fixtureB, randomLevel } from "./fixtures";
import { validateCollectLevel, type CollectLevel } from "./level";
import { SCORE_SPEC, difficultyScore, measureLevel, type Measures } from "./measures";
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

  it("failure rates never enter it: no component reads a win rate, and changing them changes nothing", () => {
    for (const c of SCORE_SPEC) {
      expect(["randomRate", "wins"]).not.toContain(c.measure);
    }
    const base = difficultyScore(m).total;
    const failMore: Measures = {
      ...m,
      randomRate: 0,
      wins: Object.fromEntries(Object.keys(m.wins).map((k) => [k, false])) as Measures["wins"],
    };
    const failLess: Measures = {
      ...m,
      randomRate: 1,
      wins: Object.fromEntries(Object.keys(m.wins).map((k) => [k, true])) as Measures["wins"],
    };
    expect(difficultyScore(failMore).total).toBe(base);
    expect(difficultyScore(failLess).total).toBe(base);
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

  it("no decisions means no recovery points even if a loss were reachable elsewhere", () => {
    const noLoss: Measures = { ...m, reachableLoss: false, recoverableShare: 0 };
    expect(difficultyScore(noLoss).components.find((c) => c.id === "recovery")!.points).toBe(0);
  });
});
