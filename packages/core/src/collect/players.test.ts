import { describe, expect, it } from "vitest";
import { legalActions, type Action } from "./actions";
import { board, fixtureA, fixtureB, randomLevel } from "./fixtures";
import { validateCollectLevel, type CollectLevel } from "./level";
import {
  DETERMINISTIC_PLAYERS,
  RANDOM_RUNS,
  runPlayer,
  strategyReport,
  type PlayerId,
} from "./players";
import { apply } from "./actions";
import { runUntilSettled } from "./sim";
import { cloneState, createCollectState } from "./state";
import { solve } from "./solver";

/** M12.3: each simulated player follows its rule from docs/DIFFICULTY_V2.md §2, on levels with known outcomes. */

const columnsOf = (taken: Action[]) =>
  taken.map((a) => (a.kind === "select" ? `c${a.column}` : `s${a.slot}`));

/** Three open colours in three columns: nothing can go wrong, so each player's order is visible. */
const open3 = (cols: [string, number][][]): CollectLevel =>
  board(["RRR", "GGG", "BBB"], cols, {
    colors: "RGB",
    slots: 3,
    squad: 3,
    spawnGap: 1,
    fieldCap: 3,
  });

describe("the nine deterministic players and random: documented rules", () => {
  it("lists the nine players of the difficulty document", () => {
    expect([...DETERMINISTIC_PLAYERS]).toEqual([
      "first-front",
      "last-front",
      "round-robin",
      "tidy-left",
      "tidy-right",
      "largest",
      "smallest",
      "most-delivered",
      "clears-capacity",
    ]);
    expect(RANDOM_RUNS).toBe(200);
  });

  it("a one-group level: every player wins in one action", () => {
    const level = board(["RR"], [[["R", 2]]], { colors: "R", slots: 1 });
    const report = strategyReport(level);
    expect(report.simpleWins).toBe(9);
    expect(report.randomRate).toBe(1);
    expect(report.witnessedLoss).toBe(false);
    for (const id of DETERMINISTIC_PLAYERS) expect(runPlayer(level, id).actions, id).toBe(1);
  });

  // Three open colours of three cubes each, dealt so that column order is visible:
  // c0 [R2, B1], c1 [G2, B1], c2 [G1, R1, B1].
  const level = () =>
    open3([
      [
        ["R", 2],
        ["B", 1],
      ],
      [
        ["G", 2],
        ["B", 1],
      ],
      [
        ["G", 1],
        ["R", 1],
        ["B", 1],
      ],
    ]);

  it("the level is valid and open: everything is reachable from the first move", () => {
    expect(validateCollectLevel(level())).toEqual([]);
  });

  it("first-front takes the first column until it is empty; last-front the last", () => {
    expect(columnsOf(runPlayer(level(), "first-front").taken)).toEqual([
      "c0",
      "c0",
      "c1",
      "c1",
      "c2",
      "c2",
      "c2",
    ]);
    expect(columnsOf(runPlayer(level(), "last-front").taken)).toEqual([
      "c2",
      "c2",
      "c2",
      "c1",
      "c1",
      "c0",
      "c0",
    ]);
  });

  it("round-robin takes one from each column in turn, starting at column 0, skipping empty ones", () => {
    expect(columnsOf(runPlayer(level(), "round-robin").taken)).toEqual([
      "c0",
      "c1",
      "c2",
      "c0",
      "c1",
      "c2",
      "c2",
    ]);
  });

  it("largest and smallest pick the front with the most or least capacity left (ties: list order)", () => {
    // Fronts at the start: R2 (c0), G2 (c1), G1 (c2).
    const largest = columnsOf(runPlayer(level(), "largest").taken);
    const smallest = columnsOf(runPlayer(level(), "smallest").taken);
    expect(largest.slice(0, 2)).toEqual(["c0", "c1"]); // R2 ties G2: c0 first; then G2 is the biggest
    // G1 (c2) is the smallest, and the next fronts of c2 (R1, B1) stay the smallest: it eats column 2.
    expect(smallest.slice(0, 3)).toEqual(["c2", "c2", "c2"]);
  });

  it("tidy players resume a waiting group when they can, else take the first or last front", () => {
    // With nothing ever parked these two reduce to first-front and last-front.
    expect(columnsOf(runPlayer(level(), "tidy-left").taken)).toEqual(
      columnsOf(runPlayer(level(), "first-front").taken),
    );
    expect(columnsOf(runPlayer(level(), "tidy-right").taken)).toEqual(
      columnsOf(runPlayer(level(), "last-front").taken),
    );
  });
});

describe("fixture B (parking): the known outcome of every player", () => {
  const report = strategyReport(fixtureB());

  it("the players that open the buried colours first run out of slots; the ones that clear the blue win", () => {
    expect(report.wins).toEqual({
      "first-front": false, // red parks, then green parks: one slot only
      "last-front": true, // the blue group first exposes everything
      "round-robin": false, // column 0 (red) then column 1 (green)
      "tidy-left": false, // nothing is resumable, so first front, as first-front
      "tidy-right": true,
      largest: true, // blue has the most capacity
      smallest: false, // red (2), tied with green, first in list order
      "most-delivered": true, // blue delivers 16
      "clears-capacity": true, // only blue completes its group
    });
    expect(report.simpleWins).toBe(5);
    expect(report.losses).toEqual({
      "first-front": "slotsFull",
      "round-robin": "slotsFull",
      "tidy-left": "slotsFull",
      smallest: "slotsFull",
    });
    expect(report.witnessedLoss).toBe(true);
  });

  it("random play wins some and loses some, the same every time (seeds 0..199)", () => {
    expect(report.randomRate).toBeGreaterThan(0.3);
    expect(report.randomRate).toBeLessThan(0.9);
    expect(strategyReport(fixtureB())).toEqual(report);
  });

  it("the mirror image (columns reversed) mirrors first-front and last-front", () => {
    const mirrored: CollectLevel = { ...fixtureB(), columns: [...fixtureB().columns].reverse() };
    const m = strategyReport(mirrored);
    expect(m.wins["first-front"]).toBe(report.wins["last-front"]);
    expect(m.wins["last-front"]).toBe(report.wins["first-front"]);
    expect(m.wins["tidy-left"]).toBe(report.wins["tidy-right"]);
    expect(m.wins["tidy-right"]).toBe(report.wins["tidy-left"]);
  });
});

describe("an unwinnable level: everyone loses", () => {
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

  it("agrees with the solver: no player wins, random never wins, losses are witnessed", () => {
    expect(solve(dead).status).toBe("unsolvable");
    const report = strategyReport(dead);
    expect(report.simpleWins).toBe(0);
    expect(report.randomRate).toBe(0);
    expect(report.witnessedLoss).toBe(true);
  });
});

describe("most-delivered and clears-capacity", () => {
  /** The first action each takes, on levels where their rules can differ. */
  function firstActions(level: CollectLevel) {
    const s = createCollectState(level);
    const legal = legalActions(s);
    const delivered = legal.map((a) => {
      const n = cloneState(s);
      apply(n, a);
      runUntilSettled(n);
      return {
        a,
        delivered: n.deliveredTotal,
        completes: n.groups.some((g) => g.status === "completed"),
      };
    });
    return { legal, delivered };
  }

  it("most-delivered takes the action that delivers the most; clears-capacity prefers one that completes its group", () => {
    let differing = 0;
    for (let seed = 1; seed <= 600 && differing < 8; seed++) {
      const level = randomLevel(seed, seed % 2 === 0);
      if (!level || validateCollectLevel(level).length > 0) continue;
      const { legal, delivered } = firstActions(level);
      if (legal.length < 2) continue;
      const s7 = runPlayer(level, "most-delivered").taken[0]!;
      const s8 = runPlayer(level, "clears-capacity").taken[0]!;
      const byAction = (a: Action) =>
        delivered[legal.findIndex((x) => JSON.stringify(x) === JSON.stringify(a))]!;
      // S7: no legal action delivers more than the one it took.
      expect(byAction(s7).delivered, `seed ${seed}`).toBe(
        Math.max(...delivered.map((d) => d.delivered)),
      );
      // S8: if some action completes its group it took one of those, delivering the most among them.
      const completing = delivered.filter((d) => d.completes);
      if (completing.length > 0) {
        expect(byAction(s8).completes, `seed ${seed}`).toBe(true);
        expect(byAction(s8).delivered).toBe(Math.max(...completing.map((d) => d.delivered)));
      } else {
        expect(JSON.stringify(s8), `seed ${seed}`).toBe(JSON.stringify(s7));
      }
      if (JSON.stringify(s7) !== JSON.stringify(s8)) differing++;
    }
    expect(differing).toBeGreaterThanOrEqual(1);
  });
});

describe("the players are deterministic and bounded", () => {
  it("the same level gives the same report; random runs are seeded", () => {
    const level = fixtureB();
    expect(runPlayer(level, "random", 7)).toEqual(runPlayer(level, "random", 7));
    expect(strategyReport(level, 20)).toEqual(strategyReport(level, 20));
    const a = runPlayer(level, "random", 1).taken;
    const outcomes = new Set(
      Array.from({ length: 30 }, (_, i) => JSON.stringify(runPlayer(level, "random", i).taken)),
    );
    expect(outcomes.size).toBeGreaterThan(1);
    expect(a.length).toBeGreaterThan(0);
  });

  it("every run ends: within 3 actions per group, or it counts as a loss for the win rate", () => {
    for (let seed = 1; seed <= 80; seed++) {
      const level = randomLevel(seed, seed % 2 === 0);
      if (!level || validateCollectLevel(level).length > 0) continue;
      const groups = level.columns.flat().length;
      for (const id of [...DETERMINISTIC_PLAYERS, "random"] as (PlayerId | "random")[]) {
        const r = runPlayer(level, id, seed);
        expect(r.actions, `${id} seed ${seed}`).toBeLessThanOrEqual(3 * groups);
        expect(r.won === (r.lost === null)).toBe(true);
      }
    }
  });

  it("fixture A is won by everyone", () => {
    expect(strategyReport(fixtureA()).simpleWins).toBe(9);
  });
});
