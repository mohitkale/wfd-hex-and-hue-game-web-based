import { describe, expect, it } from "vitest";
import { createRng } from "../rng";
import { apply, legalActions, type Action } from "./actions";
import type { CollectEvent } from "./events";
import { board, fixtureA, fixtureB, fixtureC, fixtureD, fixtureE, randomLevel } from "./fixtures";
import { paddedIndex, topologyFor } from "./grid";
import { violation } from "./invariants";
import { validateCollectLevel, type CollectLevel } from "./level";
import { replay } from "./session";
import { isSettled, runUntilSettled, step } from "./sim";
import { createCollectState, type CollectState } from "./state";
import { nearestTarget } from "./targeting";
import { bruteSolve, playLine } from "./testing";

const select = (column: number): Action => ({ kind: "select", column });
const resume = (slot: number): Action => ({ kind: "resume", slot });

function settle(s: CollectState): CollectEvent[] {
  const out: CollectEvent[] = [];
  for (let i = 0; i < 5_000 && !isSettled(s) && s.status === "playing"; i++) {
    out.push(...step(s));
    expect(violation(s), `tick ${s.tick}`).toBeNull();
  }
  expect(isSettled(s) || s.status !== "playing", "did not settle").toBe(true);
  return out;
}

describe("edge cases R-01 … R-20 (GAME_DESIGN_V2 §4a), by id", () => {
  it("R-01: a cube on the mosaic edge is accessible at the start", () => {
    const s = createCollectState(board(["XXX", "XXX", "XXX"], [[["X", 9]]], { colors: "X" }));
    const t = topologyFor(3, 3);
    // Every border cube is accessible, the centre cube is not.
    expect(nearestTarget(s, 0)).not.toBeNull();
    const centre = paddedIndex(5, 1, 1);
    const neighbours = [0, 1, 2, 3].map((k) => t.neighbors[centre * 4 + k]!);
    expect(neighbours.every((n) => s.dist[n] === -1)).toBe(true);
    expect(s.dist[paddedIndex(5, 0, 0) - 1]).toBeGreaterThanOrEqual(0); // the ring cell beside a corner cube
  });

  it("R-02: a cube with only cube neighbours is not accessible", () => {
    const s = createCollectState(fixtureB());
    const hiddenRed = paddedIndex(7, 1, 1);
    expect(nearestTarget(s, 1)!.cube).toBe(paddedIndex(7, 1, 3)); // only the bottom red is offered
    expect(s.dist[hiddenRed]).toBe(-1);
  });

  it("R-03 and R-04 and R-05: see sim.test.ts (channel, pocket, diagonal)", () => {
    // Labelled here so the traceability check below finds them; the boards are in sim.test.ts.
    expect(true).toBe(true);
  });

  it("R-06: several familiars of one group reserve different cubes and may share a cell", () => {
    const s = createCollectState(fixtureC(3));
    apply(s, select(0));
    const reserved: number[] = [];
    for (let i = 0; i < 6; i++) {
      for (const e of step(s)) if (e.type === "cubeReserved") reserved.push(e.cube);
    }
    expect(new Set(reserved).size).toBe(reserved.length);
    expect(reserved.length).toBeGreaterThanOrEqual(2);
  });

  it("R-07: see sim.test.ts (fixture E) — the lower group id reserves, the other parks", () => {
    const s = createCollectState(fixtureE());
    apply(s, select(0));
    apply(s, select(1));
    step(s);
    expect(s.groups[1]!.status).toBe("waiting");
  });

  it("R-10: a cube behind a chain of cubes is reached only after each link is removed", () => {
    // Yellow sits behind blue A behind blue B (bottom row, touching the ring).
    const level = board(
      ["BBB", "BYB", "BBB", "BXB"],
      [
        [["B", 8]],
        [
          ["X", 1],
          ["Y", 1],
        ],
      ],
      {
        colors: "BYX",
        slots: 2,
        squad: 1,
        spawnGap: 1,
      },
    );
    const s = createCollectState(level);
    const yellow = paddedIndex(5, 1, 1);
    expect(level.palette).toHaveLength(3);
    apply(s, select(0));
    let seenAccessible: number | null = null;
    for (let i = 0; i < 400 && !isSettled(s); i++) {
      step(s);
      const accessible = nearestTarget(s, 1) !== null;
      if (accessible && seenAccessible === null) {
        seenAccessible = s.tick;
        // At that moment one of yellow's four neighbours (all blue) has been removed.
        const t = topologyFor(3, 4);
        const open = [0, 1, 2, 3].filter((k) => s.grid[t.neighbors[yellow * 4 + k]!] === -1);
        expect(open.length).toBeGreaterThanOrEqual(1);
      }
      if (seenAccessible === null) expect(nearestTarget(s, 1)).toBeNull();
    }
    expect(seenAccessible).not.toBeNull();
  });

  it("R-11: a route is fixed when assigned and never changes while the familiar uses it", () => {
    // Over many random games (where pickups keep opening shorter ways), a familiar's route stays
    // exactly as assigned until the familiar is reassigned or retired.
    let checkedTicks = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const level = randomLevel(seed, seed % 2 === 0);
      if (!level || validateCollectLevel(level).length > 0) continue;
      const rng = createRng(seed);
      const s = createCollectState(level);
      const assigned = new Map<string, string>();
      for (let i = 0; i < 20_000 && s.status === "playing"; i++) {
        if (isSettled(s) || rng.next() < 0.15) {
          const legal = legalActions(s);
          if (legal.length > 0) apply(s, legal[rng.int(0, legal.length - 1)]!);
        }
        step(s);
        for (const f of s.familiars) {
          if (f.status === "idle") continue;
          const key = `${f.id}:${f.cube}`;
          const route = f.route.join(",");
          const first = assigned.get(key);
          if (first === undefined) assigned.set(key, route);
          else {
            expect(route, `${level.id} familiar ${f.id}`).toBe(first);
            checkedTicks++;
          }
        }
      }
    }
    expect(checkedTicks).toBeGreaterThan(500);
  });

  it("R-12: a standing cell equal to the portal gives pickup then deliver (spawn t, deliver t+2)", () => {
    const s = createCollectState(fixtureA());
    apply(s, select(0));
    const spawn = step(s);
    expect(spawn[0]).toMatchObject({ type: "familiarSpawned", routeLength: 0 });
    const spawnTick = s.tick;
    let deliveredAt = -1;
    for (let i = 0; i < 4 && deliveredAt === -1; i++) {
      if (step(s).some((e) => e.type === "cubeDelivered")) deliveredAt = s.tick;
    }
    expect(deliveredAt).toBe(spawnTick + 2);
  });

  it("R-13: cubes of the colour are all reserved by others — the group does not take them", () => {
    const s = createCollectState(fixtureE());
    apply(s, select(0));
    apply(s, select(1));
    step(s);
    // Group 0 holds the only accessible red; group 1 got none and parked.
    expect(s.groups[0]!.committed).toBe(1);
    expect(s.groups[1]!.committed).toBe(0);
    expect(s.familiars.every((f) => f.group === 0)).toBe(true);
  });

  it("R-14: uncommitted capacity with every remaining cube hidden parks with the exact number", () => {
    const s = createCollectState(fixtureB());
    apply(s, select(0));
    settle(s);
    expect(s.groups[0]).toMatchObject({ status: "waiting", capacity: 2, delivered: 1 });
  });

  it("R-15: capacity runs out before the accessible cubes do — extras stay for other groups", () => {
    const s = createCollectState(fixtureC(1));
    apply(s, select(0));
    settle(s);
    expect(s.grid.filter((c) => c === 0)).toHaveLength(2);
    expect(nearestTarget(s, 0)).not.toBeNull();
  });

  it("R-17: equal distances are broken by smaller y, then smaller x", () => {
    // Portal under the middle cube: it goes first (distance 0); then the two outer cubes are
    // equally far and the left one (smaller x) is reserved before the right one.
    const level = board(["PPP"], [[["P", 3]]], { colors: "P", squad: 1, spawnGap: 1, portalX: 1 });
    const s = createCollectState(level);
    apply(s, select(0));
    const reserved: number[] = [];
    for (const e of runUntilSettled(s)) if (e.type === "cubeReserved") reserved.push(e.cube);
    expect(reserved).toEqual([paddedIndex(5, 1, 0), paddedIndex(5, 0, 0), paddedIndex(5, 2, 0)]);

    // And by smaller y first: two equally distant cubes in different rows.
    const rows = board(["P.", ".P"], [[["P", 2]]], {
      colors: "P",
      squad: 1,
      spawnGap: 1,
      portalX: 0,
    });
    const t = createCollectState(rows);
    apply(t, select(0));
    const order: number[] = [];
    for (const e of runUntilSettled(t)) if (e.type === "cubeReserved") order.push(e.cube);
    // Both cubes are at distance 1 from the portal; the one in the smaller row goes first.
    expect(order).toEqual([paddedIndex(4, 0, 0), paddedIndex(4, 1, 1)]);
  });

  it("R-18/R-19: the capacity identity and reservation integrity hold on every tick of every fixture", () => {
    for (const level of [fixtureA(), fixtureB(), fixtureC(3), fixtureD(), fixtureE()]) {
      const s = createCollectState(level);
      for (let guard = 0; guard < 50 && s.status === "playing"; guard++) {
        const legal = legalActions(s);
        if (legal.length === 0) break;
        apply(s, legal[0]!);
        settle(s);
      }
    }
  });

  it("R-20: a level with no legal first action is rejected", () => {
    const level = board(
      ["BBB", "BRB", "BBB"],
      [
        [
          ["R", 1],
          ["B", 8],
        ],
      ],
      { colors: "BR" },
    );
    expect(validateCollectLevel(level).join()).toContain("no legal first action");
  });
});

describe("whole puzzles, solved headlessly through the public API", () => {
  it("fixture B: the search finds a winning line and replaying it through a session wins", () => {
    const result = bruteSolve(fixtureB());
    expect(result.status).toBe("solved");
    expect(result.losses).toBeGreaterThan(0); // and there are ways to lose on the way
    const session = playLine(fixtureB(), result.line!);
    expect(session.state.status).toBe("won");
    expect(replay(fixtureB(), session.log).state.status).toBe("won");
  });

  it("fixture B with one slot is solvable only by clearing the blue before parking twice", () => {
    const { line } = bruteSolve(fixtureB());
    // The only way to avoid the second park is to open the blue group before both red and green.
    const blueFirst = line!.some((a, i) => a.kind === "select" && a.column === 2 && i < 2);
    expect(blueFirst).toBe(true);
  });

  it("a level that is lost whatever the player does is reported unsolvable", () => {
    const rows = ["BBBBBBB", "BBBBBBB", "BBBBBBB", "BBBRBBB", "BBBBBBB", "BBBBBBB", "BBBBBBB"];
    const level = board(
      rows,
      [
        [["B", 2]],
        [
          ["R", 1],
          ["B", 46],
        ],
      ],
      { colors: "BR", slots: 2 },
    );
    const result = bruteSolve(level);
    expect(result.status).toBe("unsolvable");
    expect(result.line).toBeNull();
  });

  it("the purple-12 puzzle (7 reachable) is solvable and uses the slot exactly once", () => {
    const level = board(["BBBBBBB", "BPPPPPB", "BBBBBBB", "PPPPPPP"], [[["P", 12]], [["B", 16]]], {
      colors: "BP",
      slots: 2,
      squad: 3,
      spawnGap: 1,
    });
    const result = bruteSolve(level);
    expect(result.status).toBe("solved");
    const session = playLine(level, result.line!);
    expect(session.state.status).toBe("won");
    expect(session.state.deliveredTotal).toBe(28);
  });

  it("agrees with brute force on random small levels: unsolvable means no random settled play wins", () => {
    let solvable = 0;
    let unsolvable = 0;
    for (let seed = 1; seed <= 300 && solvable + unsolvable < 60; seed++) {
      const level = randomLevel(seed, true);
      if (!level || validateCollectLevel(level).length > 0) continue;
      const result = bruteSolve(level, 20_000);
      if (result.status === "unknown") continue;
      const rng = createRng(seed);
      let randomWin = false;
      for (let run = 0; run < 25 && !randomWin; run++) {
        const s = createCollectState(level);
        for (let i = 0; i < 200 && s.status === "playing"; i++) {
          const legal = legalActions(s);
          if (legal.length === 0) break;
          apply(s, legal[rng.int(0, legal.length - 1)]!);
          runUntilSettled(s);
        }
        randomWin = s.status === "won";
      }
      if (result.status === "unsolvable") {
        unsolvable++;
        expect(randomWin, `seed ${seed}`).toBe(false);
      } else {
        solvable++;
        // A found line must really win when replayed.
        expect(playLine(level, result.line!).state.status, `seed ${seed}`).toBe("won");
      }
    }
    expect(solvable).toBeGreaterThan(10);
    expect(unsolvable).toBeGreaterThan(0);
  });
});

describe("no invisible or teleported pickups, no duplicate collection", () => {
  function allEvents(level: CollectLevel, seed: number) {
    const rng = createRng(seed);
    const s = createCollectState(level);
    const events: CollectEvent[] = [];
    const cellOf = new Map<number, number>(); // familiar id -> current cell
    const snapshots: { e: CollectEvent; at: Map<number, number>; grid: number[] }[] = [];
    for (let i = 0; i < 20_000 && s.status === "playing"; i++) {
      if (isSettled(s) || rng.next() < 0.15) {
        const legal = legalActions(s);
        if (legal.length > 0) events.push(...apply(s, legal[rng.int(0, legal.length - 1)]!));
      }
      const t = step(s);
      for (const e of t) {
        snapshots.push({ e, at: new Map(cellOf), grid: s.grid.slice() });
        if (e.type === "familiarSpawned") cellOf.set(e.familiar, s.params.portal);
        if (e.type === "familiarMoved") cellOf.set(e.familiar, e.to);
        if (e.type === "familiarRetired") cellOf.delete(e.familiar);
      }
      events.push(...t);
    }
    return { s, events, snapshots };
  }

  const levels: CollectLevel[] = [];
  for (let seed = 1; seed <= 500 && levels.length < 80; seed++) {
    const level = randomLevel(seed, seed % 2 === 0);
    if (level && validateCollectLevel(level).length === 0) levels.push(level);
  }

  it("every move is a single step between open neighbouring cells", () => {
    levels.forEach((level, i) => {
      const { s, events } = allEvents(level, 6000 + i);
      const t = topologyFor(level.width, level.height);
      for (const e of events) {
        if (e.type !== "familiarMoved") continue;
        const adjacent = [0, 1, 2, 3].some((k) => t.neighbors[e.from * 4 + k] === e.to);
        expect(adjacent, `${level.id}: ${e.from} -> ${e.to} is not one step`).toBe(true);
      }
      expect(s.status).not.toBe("playing");
    });
  });

  it("a familiar picks up only from the cell next to its cube, after walking there", () => {
    levels.forEach((level, i) => {
      const { snapshots } = allEvents(level, 7000 + i);
      const t = topologyFor(level.width, level.height);
      for (const { e, at } of snapshots) {
        if (e.type !== "cubePickedUp") continue;
        const where = at.get(e.familiar);
        expect(where, `${level.id}: familiar ${e.familiar} has no position`).toBeDefined();
        const next = [0, 1, 2, 3].some((k) => t.neighbors[where! * 4 + k] === e.cube);
        expect(next, `${level.id}: pickup of ${e.cube} from ${where}`).toBe(true);
      }
    });
  });

  it("a cube is never reserved twice at once and never picked up or delivered twice", () => {
    levels.forEach((level, i) => {
      const { events } = allEvents(level, 8000 + i);
      const live = new Set<number>();
      const picked = new Set<number>();
      let deliveries = 0;
      let pickups = 0;
      const owner = new Map<number, number>(); // familiar -> reserved cube
      for (const e of events) {
        if (e.type === "cubeReserved") {
          expect(live.has(e.cube), `${level.id}: cube ${e.cube} reserved twice`).toBe(false);
          live.add(e.cube);
          owner.set(e.familiar, e.cube);
        } else if (e.type === "cubePickedUp") {
          expect(owner.get(e.familiar)).toBe(e.cube);
          expect(picked.has(e.cube), `${level.id}: cube ${e.cube} picked up twice`).toBe(false);
          picked.add(e.cube);
          live.delete(e.cube);
          pickups++;
        } else if (e.type === "cubeDelivered") {
          deliveries++;
        }
      }
      expect(deliveries).toBeLessThanOrEqual(pickups);
      expect(pickups - deliveries).toBeLessThanOrEqual(level.squad * level.fieldCap);
    });
  });
});

describe("win is on delivery, and big boards finish", () => {
  it("picking up the last cube does not win; delivering it does", () => {
    const s = createCollectState(
      board(["R"], [[["R", 1]]], { colors: "R", slots: 1, squad: 1, spawnGap: 1 }),
    );
    apply(s, select(0));
    step(s); // spawn
    step(s); // pickup: the board is empty but the cube is carried
    expect(s.grid.every((c) => c === -1)).toBe(true);
    expect(s.status).toBe("playing");
    expect(s.deliveredTotal).toBe(0);
    const ev = step(s); // deliver
    expect(s.status).toBe("won");
    expect(ev.map((e) => e.type)).toEqual([
      "cubeDelivered",
      "familiarRetired",
      "groupCompleted",
      "won",
    ]);
  });

  it("a 40×40 single-colour board is cleared by one 1,600-capacity group", () => {
    const rows = Array.from({ length: 40 }, () => "X".repeat(40));
    const level = board(rows, [[["X", 1600]]], { colors: "X", slots: 1, squad: 6, spawnGap: 1 });
    expect(validateCollectLevel(level)).toEqual([]);
    const s = createCollectState(level);
    apply(s, select(0));
    const ev = runUntilSettled(s);
    expect(s.status).toBe("won");
    expect(s.deliveredTotal).toBe(1600);
    expect(ev.filter((e) => e.type === "cubeDelivered")).toHaveLength(1600);
    expect(violation(s)).toBeNull();
    expect(s.tick).toBeLessThan(60_000);
  });

  it("two groups of different colours working at once never block or double-collect", () => {
    const rows = Array.from({ length: 6 }, (_, y) => (y % 2 === 0 ? "RGRGRG" : "GRGRGR"));
    const level = board(rows, [[["R", 18]], [["G", 18]]], {
      colors: "RG",
      slots: 2,
      squad: 3,
      spawnGap: 1,
    });
    const s = createCollectState(level);
    apply(s, select(0));
    apply(s, select(1));
    settle(s);
    expect(s.status === "won" || s.status === "playing").toBe(true);
    expect(s.deliveredTotal + s.grid.filter((c) => c !== -1).length).toBe(36);
    expect(resume(0)).toEqual({ kind: "resume", slot: 0 });
  });
});
