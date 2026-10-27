import * as collect from "@hexhue/core/collect";
import { createRng } from "@hexhue/core";
import { describe, expect, it } from "vitest";
import { bruteSolve, playLine } from "../../packages/core/src/collect/testing";
import {
  DEMO_WIN_LINE,
  LOSE_LINES,
  WIN_LINE,
  moonlitHat,
} from "../../packages/game/src/collect/slice";

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

  it("the board's demo win has no resume taps and still wins under auto-resume", () => {
    expect(DEMO_WIN_LINE.some((a) => a.kind === "resume")).toBe(false);
    const s = new collect.CollectSession(level, undefined, undefined, true);
    for (const a of DEMO_WIN_LINE) {
      expect(s.tap(a).ok).toBe(true);
      for (let i = 0; i < 50_000 && s.tick() !== null; i++);
    }
    expect(s.state.status).toBe("won");
    const d = new collect.CollectSession(level, undefined, undefined, true);
    for (const a of LOSE_LINES.deadlock) {
      d.tap(a);
      for (let i = 0; i < 50_000 && d.tick() !== null; i++);
    }
    expect(d.state.lossReason).toBe("deadlock");
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

  it("the traps on the winning line are exactly the ones the guide lists (taps 1, 2, 4, 7, 8)", () => {
    const solvable = makeSolvable();
    const s = collect.createCollectState(level);
    const decisions: { tap: number; winning: number; of: number }[] = [];
    const parked: number[] = [];
    for (const [i, action] of WIN_LINE.entries()) {
      const legal = collect.legalActions(s);
      const winning = legal.filter((a) => solvable(settled(s, a))).length;
      if (winning < legal.length) decisions.push({ tap: i + 1, winning, of: legal.length });
      collect.apply(s, action);
      collect.runUntilSettled(s);
      if (i === 0 || i === 2) {
        // After tap 1 and tap 3 a group waits in a slot with this many cubes left.
        parked.push(
          ...s.slots
            .filter((x): x is number => x !== null)
            .map((x) => s.groups[x]!.capacity - s.groups[x]!.delivered),
        );
      }
    }
    expect(s.status).toBe("won");
    expect(decisions.map((d) => d.tap)).toEqual([1, 2, 4, 7, 8]);
    // The very first tap: only one of the three fronts keeps the level winnable.
    expect(decisions[0]).toEqual({ tap: 1, winning: 1, of: 3 });
    // Cyan parks with 7 left after tap 1; after tap 3 gold has parked with 6 left beside it.
    expect(parked).toEqual([7, 7, 6]);
  });

  it("cheap strategies lose from the start (each ends in a real loss), and so do most orders", () => {
    for (const [name, result] of Object.entries(runCheapPlayers(false))) {
      expect(result.status, name).toBe("lost");
      expect(result.taps, name).toBeGreaterThan(0);
    }
  });

  /**
   * An honest limit, pinned so it cannot be forgotten: the traps are all in the first eight taps.
   * Given the one correct opening, three of the cheap strategies win. Depth after the opening is a
   * known weakness of this slice level (docs/V2_SLICE.md), to be addressed by the generator work.
   */
  it("after the correct opening, right-to-left spam, tidy-right and smallest still win", () => {
    const results = runCheapPlayers(true);
    const winners = Object.entries(results)
      .filter(([, r]) => r.status === "won")
      .map(([n]) => n)
      .sort();
    expect(winners).toEqual(["lastFront", "smallest", "tidyRight"]);
  });

  function runCheapPlayers(afterOpening: boolean) {
    const run = (pick: (s: State, legal: collect.Action[]) => collect.Action) => {
      const s = collect.createCollectState(level);
      let taps = 0;
      if (afterOpening) {
        collect.apply(s, WIN_LINE[0]!);
        collect.runUntilSettled(s);
      }
      for (let i = 0; i < 60 && s.status === "playing"; i++) {
        const legal = collect.legalActions(s);
        if (legal.length === 0) break;
        collect.apply(s, pick(s, legal));
        collect.runUntilSettled(s);
        taps++;
      }
      return { status: s.status, taps };
    };
    const fronts = (l: collect.Action[]) => l.filter((a) => a.kind === "select");
    const left = (l: collect.Action[]) => fronts(l)[0] ?? l[0]!;
    const right = (l: collect.Action[]) => fronts(l).at(-1) ?? l[0]!;
    const remaining = (s: State, a: collect.Action) => {
      const id = a.kind === "select" ? s.columns[a.column]![0]! : s.slots[a.slot]!;
      return s.groups[id]!.capacity - s.groups[id]!.delivered;
    };
    const delivered = (s: State, a: collect.Action) => settled(s, a).deliveredTotal;
    const roundRobin = () => {
      let last = -1;
      return (_s: State, l: collect.Action[]) => {
        const cols = fronts(l) as { kind: "select"; column: number }[];
        const next = cols.find((a) => a.column > last) ?? cols[0] ?? l[0]!;
        last = next.kind === "select" ? next.column : last;
        return next;
      };
    };
    const players: Record<string, (s: State, l: collect.Action[]) => collect.Action> = {
      firstFront: (_s, l) => left(l),
      lastFront: (_s, l) => right(l),
      roundRobin: roundRobin(),
      tidyLeft: (_s, l) => l.find((a) => a.kind === "resume") ?? left(l),
      tidyRight: (_s, l) => l.find((a) => a.kind === "resume") ?? right(l),
      largest: (s, l) => l.reduce((b, a) => (remaining(s, a) > remaining(s, b) ? a : b)),
      smallest: (s, l) => l.reduce((b, a) => (remaining(s, a) < remaining(s, b) ? a : b)),
      mostDelivered: (s, l) => l.reduce((b, a) => (delivered(s, a) > delivered(s, b) ? a : b)),
    };
    return Object.fromEntries(Object.entries(players).map(([n, p]) => [n, run(p)]));
  }

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
    expect(wins).toBe(32); // 16% of these 200 seeded runs (the doc quotes it)
  });
});
