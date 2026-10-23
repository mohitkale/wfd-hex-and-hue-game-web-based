import * as collect from "@hexhue/core/collect";
import { createRng } from "@hexhue/core";
import { describe, expect, it } from "vitest";
import { bruteSolve, playLine } from "../../packages/core/src/collect/testing";
import { LOSE_LINES, WIN_LINE, moonlitHat } from "../../packages/game/src/collect/slice";

/** The M10.5 vertical-slice level: valid, solvable, strategic, and with a demonstrable loss. */

type State = ReturnType<typeof collect.createCollectState>;

const settled = (s: State, a: collect.Action): State => {
  const next = collect.cloneState(s);
  collect.apply(next, a);
  collect.runUntilSettled(next);
  return next;
};

/** Memoised "can this settled state still be won" over the real engine. */
function makeSolvable() {
  const memo = new Map<string, boolean>();
  const solvable = (s: State): boolean => {
    if (s.status === "won") return true;
    if (s.status === "lost") return false;
    const key = collect.stateKey(s);
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const ok = collect.legalActions(s).some((a) => solvable(settled(s, a)));
    memo.set(key, ok);
    return ok;
  };
  return solvable;
}

describe("Moonlit Hat (the vertical slice)", () => {
  const level = moonlitHat();

  it("is a valid level with a real picture: six colours, 196 cubes, a hidden core", () => {
    expect(collect.validateCollectLevel(level)).toEqual([]);
    const used = new Set(level.cells.filter((c) => c >= 0));
    expect([...used].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(level.cells.filter((c) => c >= 0)).toHaveLength(196);
    expect(level.columns.flat().length).toBeGreaterThanOrEqual(10);
    expect(level.slots).toBe(2);
  });

  it("the recorded winning line is legal at every step and wins, delivering every cube", () => {
    const session = playLine(level, WIN_LINE);
    expect(session.state.status).toBe("won");
    expect(session.state.deliveredTotal).toBe(session.state.cubesTotal);
    expect(session.state.slots).toEqual([null, null]);
  });

  it("the recorded losing lines lose, for the reasons they are shown for", () => {
    const deadlock = playLine(level, LOSE_LINES.deadlock);
    expect(deadlock.state.status).toBe("lost");
    expect(deadlock.state.lossReason).toBe("deadlock");
    const slots = playLine(level, LOSE_LINES.slots);
    expect(slots.state.status).toBe("lost");
    expect(slots.state.lossReason).toBe("slotsFull");
  });

  it("the search agrees: solvable, so the loss comes from choices, not from the level", () => {
    const result = bruteSolve(level, 50_000);
    expect(result.status).toBe("solved");
  });

  it("holding slots matter: the winning line loses when a slot is taken away", () => {
    const s = collect.createCollectState({ ...level, slots: 1 });
    for (const action of WIN_LINE) {
      if (s.status !== "playing") break;
      collect.apply(s, action);
      collect.runUntilSettled(s);
    }
    expect(s.status).toBe("lost");
    expect(s.lossReason).toBe("slotsFull");
  });

  it("has at least three real decisions on the way: choices that make the level unwinnable", () => {
    const solvable = makeSolvable();
    const s = collect.createCollectState(level);
    const decisions: { step: number; winning: number; of: number }[] = [];
    for (const [step, action] of WIN_LINE.entries()) {
      const legal = collect.legalActions(s);
      const winning = legal.filter((a) => solvable(settled(s, a))).length;
      if (winning < legal.length) decisions.push({ step, winning, of: legal.length });
      collect.apply(s, action);
      collect.runUntilSettled(s);
    }
    expect(s.status).toBe("won");
    expect(decisions.length).toBeGreaterThanOrEqual(3);
    // The very first tap is a real decision: only one of the three fronts keeps the level winnable.
    expect(decisions[0]).toEqual({ step: 0, winning: 1, of: 3 });
    // A trap can also come late: some step after the halfway point still has a losing option.
    expect(decisions.some((d) => d.step >= 5)).toBe(true);
  });

  it("cheap strategies do not win it: column-spam in every order, tidy, largest, smallest, greedy", () => {
    const playWith = (
      pick: (s: State, legal: collect.Action[]) => collect.Action,
    ): collect.GameStatus => {
      const s = collect.createCollectState(level);
      for (let i = 0; i < 60 && s.status === "playing"; i++) {
        const legal = collect.legalActions(s);
        if (legal.length === 0) break;
        collect.apply(s, pick(s, legal));
        collect.runUntilSettled(s);
      }
      return s.status;
    };
    const fronts = (l: collect.Action[]) => l.filter((a) => a.kind === "select");
    const left = (l: collect.Action[]) => fronts(l)[0] ?? l[0]!;
    const right = (l: collect.Action[]) => fronts(l).at(-1) ?? l[0]!;
    const remaining = (s: State, a: collect.Action) => {
      const id = a.kind === "select" ? s.columns[a.column]![0]! : s.slots[a.slot]!;
      return s.groups[id]!.capacity - s.groups[id]!.delivered;
    };
    const delivered = (s: State, a: collect.Action) => settled(s, a).deliveredTotal;
    let last = -1;
    const players: Record<string, (s: State, l: collect.Action[]) => collect.Action> = {
      firstFront: (_s, l) => left(l),
      lastFront: (_s, l) => right(l),
      roundRobin: (_s, l) => {
        const cols = fronts(l) as { kind: "select"; column: number }[];
        const next = cols.find((a) => a.column > last) ?? cols[0] ?? l[0]!;
        last = next.kind === "select" ? next.column : last;
        return next;
      },
      tidyLeft: (_s, l) => l.find((a) => a.kind === "resume") ?? left(l),
      tidyRight: (_s, l) => l.find((a) => a.kind === "resume") ?? right(l),
      largest: (s, l) => l.reduce((b, a) => (remaining(s, a) > remaining(s, b) ? a : b)),
      smallest: (s, l) => l.reduce((b, a) => (remaining(s, a) < remaining(s, b) ? a : b)),
      mostDelivered: (s, l) => l.reduce((b, a) => (delivered(s, a) > delivered(s, b) ? a : b)),
    };
    for (const [name, pick] of Object.entries(players)) {
      expect(playWith(pick), name).not.toBe("won");
    }
  });

  it("random tapping rarely wins (under one run in four)", () => {
    let wins = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed);
      const s = collect.createCollectState(level);
      for (let i = 0; i < 60 && s.status === "playing"; i++) {
        const legal = collect.legalActions(s);
        if (legal.length === 0) break;
        collect.apply(s, legal[rng.int(0, legal.length - 1)]!);
        collect.runUntilSettled(s);
      }
      if (s.status === "won") wins++;
    }
    expect(wins).toBeGreaterThan(0); // winnable by luck, not impossible
    expect(wins / 200).toBeLessThan(0.25);
  });
});
