import { describe, expect, it } from "vitest";
import { EMPTY } from "../level";
import { createRng } from "../rng";
import { apply, explain, legalActions } from "./actions";
import { board, randomLevel } from "./fixtures";
import { generateLevel, reachableByColor, type GeneratorArt } from "./generator";
import { violation } from "./invariants";
import { parseCollectLevel, validateCollectLevel, type CollectLevel, type SealSpec } from "./level";
import {
  hasSealedAccessible,
  keyCleared,
  openingSealed,
  sealGate,
  sealKeyAt,
  sealedCells,
} from "./seals";
import { runUntilSettled, step } from "./sim";
import { CollectSolver, replayLine, solve } from "./solver";
import { cloneState, createCollectState, fromJSON, hashState } from "./state";
import { bruteSolve } from "./testing";

/** M13.4: sealed cubes. A sealed cube cannot be fetched until every group of its key colour completes. */

const withSeals = (level: CollectLevel, seals: SealSpec[]): CollectLevel => ({ ...level, seals });
const settle = (s: ReturnType<typeof createCollectState>) => runUntilSettled(s);

/** `R R G` in one row: the middle R is sealed by G. Every cube touches the ring. */
const sealedRow = (): CollectLevel =>
  withSeals(
    board(["RRG"], [[["R", 2]], [["G", 1]]], {
      colors: "RG",
      squad: 1,
      spawnGap: 1,
      fieldCap: 1,
      slots: 2,
    }),
    [{ key: 1, cells: [1] }],
  );

describe("a sealed cube", () => {
  it("is skipped by its colour's group, which runs dry and waits, until the key colour is done", () => {
    const level = sealedRow();
    expect(validateCollectLevel(level)).toEqual([]);
    const s = createCollectState(level);
    expect(openingSealed(level)).toBe(1);
    const { seals: _none, ...plain } = level;
    expect(openingSealed(plain)).toBe(0); // no seals: nothing is sealed (and nothing throws)

    // R:2 can deliver only the unsealed cube: it parks with one left.
    apply(s, { kind: "select", column: 0 });
    settle(s);
    expect(s.groups[0]!.status).toBe("waiting");
    expect(s.groups[0]!.capacity - s.groups[0]!.delivered).toBe(1);
    expect(s.deliveredTotal).toBe(1);
    // Resuming it is refused as sealed, not as "no reachable cube".
    expect(explain(s, { kind: "resume", slot: 0 })).toBe("sealed");
    expect(legalActions(s)).toEqual([{ kind: "select", column: 1 }]);

    apply(s, { kind: "select", column: 1 });
    settle(s);
    expect(keyCleared(s, 1)).toBe(true);
    expect(explain(s, { kind: "resume", slot: 0 })).toBe("ok");
    apply(s, { kind: "resume", slot: 0 });
    settle(s);
    expect(s.status).toBe("won");
    expect(violation(s)).toBeNull();
  });

  it("explains a refusal as `sealed` only when sealed cubes are what is in the way", () => {
    // A group whose only reachable cubes are sealed is refused as sealed...
    const sealedOnly = withSeals(
      board(["RG"], [[["R", 1]], [["G", 1]]], { colors: "RG", squad: 1, spawnGap: 1 }),
      [{ key: 1, cells: [0] }],
    );
    const s = createCollectState(sealedOnly);
    expect(explain(s, { kind: "select", column: 0 })).toBe("sealed");
    expect(hasSealedAccessible(s, 0)).toBe(true);
    expect(hasSealedAccessible(s, 1)).toBe(false);
    // ...while a group with nothing reachable at all keeps the old reason.
    const buried = board(["BBB", "BRB", "BBB"], [[["R", 1]], [["B", 8]]], { colors: "BR" });
    expect(explain(createCollectState(buried), { kind: "select", column: 0 })).toBe(
      "noReachableCube",
    );
  });

  it("stays sealed until EVERY group of the key colour is complete, and a lifted seal never returns", () => {
    // G is split into two groups; R's last cube is sealed by G.
    const level = withSeals(
      board(["RGG"], [[["G", 1]], [["G", 1]], [["R", 1]]], {
        colors: "RG",
        squad: 1,
        spawnGap: 1,
        fieldCap: 1,
      }),
      [{ key: 1, cells: [0] }],
    );
    const s = createCollectState(level);
    expect(explain(s, { kind: "select", column: 2 })).toBe("sealed");
    apply(s, { kind: "select", column: 0 });
    settle(s);
    expect(keyCleared(s, 1)).toBe(false);
    expect(explain(s, { kind: "select", column: 2 })).toBe("sealed");
    apply(s, { kind: "select", column: 1 });
    settle(s);
    expect(keyCleared(s, 1)).toBe(true);
    expect(explain(s, { kind: "select", column: 2 })).toBe("ok");
    expect(sealedCells(s)).toEqual([]);
  });

  it("is still a cube: it occupies its cell, closed to walking, until it is collected", () => {
    const level = withSeals(
      board(["BRB", "BBB"], [[["R", 1]], [["B", 5]]], { colors: "BR", squad: 1, spawnGap: 1 }),
      [{ key: 0, cells: [1] }],
    );
    expect(validateCollectLevel(level)).toEqual([]);
    const s = createCollectState(level);
    const cell = sealedCells(s)[0]!;
    expect(s.grid[cell]).toBe(1); // the red cube is on the board
    expect(s.dist[cell]).toBe(-1); // and nobody can walk through it
    // R touches the top ring but is sealed: the R group cannot start until the blues are done.
    expect(explain(s, { kind: "select", column: 0 })).toBe("sealed");
  });

  it("knows which cubes are sealed, by which key, and drops them once they are gone or lifted", () => {
    const s = createCollectState(sealedRow());
    const gate = sealGate(s)!;
    const cell = sealedCells(s)[0]!;
    expect(gate(cell)).toBe(true);
    expect(sealKeyAt(s, cell)).toBe(1);
    expect(sealKeyAt(s, 0)).toBeNull();
    // A level without seals pays nothing: no gate at all.
    expect(
      sealGate(createCollectState(board(["RG"], [[["R", 1]], [["G", 1]]], { colors: "RG" }))),
    ).toBeNull();
  });
});

describe("seal validation", () => {
  const base = board(["RGB"], [[["R", 1]], [["G", 1]], [["B", 1]]], { colors: "RGB" });
  const errs = (seals: SealSpec[]) => validateCollectLevel(withSeals(base, seals)).join("; ");

  it("accepts a seal and an empty list", () => {
    expect(errs([{ key: 0, cells: [1] }])).toBe("");
    expect(errs([])).toBe("");
  });
  it("rejects bad keys, empty seals, non-cubes, own-colour keys and double seals", () => {
    expect(errs([{ key: 9, cells: [1] }])).toMatch(/must be \{key, cells\}/);
    expect(errs([{ key: 0, cells: [] }])).toMatch(/seals no cubes/);
    expect(errs([{ key: 0, cells: [7] }])).toMatch(/not a cube/);
    expect(errs([{ key: 0, cells: [0] }])).toMatch(/own colour/);
    expect(
      errs([
        { key: 0, cells: [1] },
        { key: 2, cells: [1] },
      ]),
    ).toMatch(/sealed twice/);
    const unused = { ...base, palette: [...base.palette, "#ffffff"] };
    expect(validateCollectLevel({ ...unused, seals: [{ key: 3, cells: [1] }] }).join()).toMatch(
      /has no cubes/,
    );
    const hole = board(["R.G"], [[["R", 1]], [["G", 1]]], { colors: "RG" });
    expect(validateCollectLevel(withSeals(hole, [{ key: 0, cells: [1] }])).join()).toMatch(
      /not a cube/,
    );
  });
  it("a level whose every opening is sealed has no legal first action", () => {
    const stuck = withSeals(board(["RG"], [[["R", 1]], [["G", 1]]], { colors: "RG" }), [
      { key: 1, cells: [0] },
      { key: 0, cells: [1] },
    ]);
    expect(validateCollectLevel(stuck).join()).toMatch(/no legal first action/);
  });
  it("round-trips through parseCollectLevel and rejects malformed seals", () => {
    const level = withSeals(base, [{ key: 0, cells: [1, 2] }]);
    expect(parseCollectLevel(JSON.parse(JSON.stringify(level))).seals).toEqual(level.seals);
    expect(() => parseCollectLevel({ ...level, seals: "nope" })).toThrow(/seals must be an array/);
    expect(() => parseCollectLevel({ ...level, seals: [{ key: 0 }] })).toThrow(/seals\[0\]/);
  });
});

describe("state with seals", () => {
  it("stores padded cells, survives JSON and cloning, and adds nothing to ordinary levels", () => {
    const s = createCollectState(sealedRow());
    expect(s.params.seals).toEqual([{ key: 1, cells: [7] }]); // (1,0) in a 5-wide padded grid: row 1, column 2
    const copy = fromJSON(JSON.parse(JSON.stringify(s)));
    expect(hashState(copy)).toBe(hashState(s));
    expect(sealedCells(copy)).toEqual(sealedCells(s));
    expect(sealedCells(cloneState(s))).toEqual(sealedCells(s));
    const bad = JSON.parse(JSON.stringify(s));
    bad.params.seals = [{ key: "x" }];
    expect(() => fromJSON(bad)).toThrow(/params.seals/);
    const plain = createCollectState(board(["RG"], [[["R", 1]], [["G", 1]]], { colors: "RG" }));
    expect("seals" in plain.params).toBe(false);
  });

  it("keeps every engine invariant on every tick of WHOLE sealed games (random legal play, lifts included)", () => {
    let games = 0;
    let lifted = 0;
    for (let seed = 1; seed <= 400 && games < 40; seed++) {
      const base = randomLevel(seed, seed % 2 === 0);
      const level = base ? sealRandom(base, seed) : null;
      if (!level) continue;
      games++;
      const rng = createRng(seed);
      const s = createCollectState(level);
      const initial = sealedCells(s).length;
      for (let move = 0; move < 200 && s.status === "playing"; move++) {
        const legal = legalActions(s);
        if (legal.length === 0) break;
        apply(s, legal[rng.int(0, legal.length - 1)]!);
        for (let i = 0; i < 5000 && s.status === "playing"; i++) {
          if (step(s).length === 0) break;
          expect(violation(s), `seed ${seed} tick ${s.tick}`).toBeNull();
          expect(violation(cloneState(s)), `seed ${seed} clone`).toBeNull();
        }
      }
      if (initial > 0 && sealedCells(s).length < initial) lifted++;
    }
    expect(games).toBeGreaterThan(20);
    expect(lifted).toBeGreaterThan(0); // the lifts really were exercised
  }, 120_000);

  it("pins the same-tick lift: a sealed group that runs dry the tick its key completes is not parked", () => {
    // R R G, R's second cube sealed by G. Both groups are summoned at once with one slot; their
    // familiars deliver on the same tick, so R runs dry exactly when G completes.
    const level = withSeals(
      board(["RRG"], [[["R", 2]], [["G", 1]]], {
        colors: "RG",
        squad: 1,
        spawnGap: 1,
        fieldCap: 2,
        slots: 1,
      }),
      [{ key: 1, cells: [1] }],
    );
    const s = createCollectState(level);
    apply(s, { kind: "select", column: 0 });
    apply(s, { kind: "select", column: 1 });
    let parkedEver = false;
    let keyDoneAt = 0;
    for (let i = 0; i < 200 && s.status === "playing"; i++) {
      if (step(s).length === 0) break;
      expect(violation(s)).toBeNull();
      if (s.groups.some((g) => g.status === "waiting")) parkedEver = true;
      if (s.groups[1]!.status === "completed" && !keyDoneAt) {
        keyDoneAt = s.tick;
        // On this very tick R has nothing out and its last cube was sealed a moment ago.
        expect(s.groups[0]!.status).toBe("working");
        expect(s.familiars.filter((f) => f.group === 0)).toEqual([]);
      }
    }
    expect(keyDoneAt).toBeGreaterThan(0);
    expect(parkedEver).toBe(false); // the single slot was never used
    expect(s.status).toBe("won");
  });
});

/** Seals a third of the cubes of the last colour with the first colour as key, if that is valid. */
function sealRandom(level: CollectLevel, seed: number): CollectLevel | null {
  const present = [...new Set(level.cells.filter((c) => c !== EMPTY))].sort((a, b) => a - b);
  if (present.length < 2) return null;
  const flip = seed % 3 === 0;
  const color = flip ? present[0]! : present[present.length - 1]!;
  const key = flip ? present[present.length - 1]! : present[0]!;
  const cells = level.cells.flatMap((c, i) => (c === color && i % 3 === seed % 3 ? [i] : []));
  if (cells.length === 0) return null;
  const candidate = withSeals(level, [{ key, cells }]);
  return validateCollectLevel(candidate).length === 0 ? candidate : null;
}

describe("solver with seals: shapes the random fuzz rarely makes", () => {
  it("two seals in a chain (R by G, G by B) have exactly the order B, G, R", () => {
    const level = withSeals(
      board(["RRGGBB"], [[["R", 2]], [["G", 2]], [["B", 2]]], {
        colors: "RGB",
        squad: 1,
        spawnGap: 1,
        slots: 3,
      }),
      [
        { key: 1, cells: [1] },
        { key: 2, cells: [3] },
      ],
    );
    expect(validateCollectLevel(level)).toEqual([]);
    const memo = solve(level, 100_000);
    expect(memo.status).toBe("solved");
    expect(bruteSolve(level, 100_000, false).status).toBe("solved");
    expect(replayLine(level, memo.line!).state.status).toBe("won");
  });

  it("a ring of seals (R by G, G by R) is a genuine deadlock: unsolvable, and the engine loses it", () => {
    const level = withSeals(
      board(["RRGG"], [[["R", 2]], [["G", 2]]], { colors: "RG", squad: 1, spawnGap: 1, slots: 2 }),
      [
        { key: 1, cells: [1] },
        { key: 0, cells: [2] },
      ],
    );
    expect(validateCollectLevel(level)).toEqual([]);
    expect(solve(level, 100_000).status).toBe("unsolvable");
    expect(bruteSolve(level, 100_000, false).status).toBe("unsolvable");
    const s = createCollectState(level);
    apply(s, { kind: "select", column: 0 });
    runUntilSettled(s);
    apply(s, { kind: "select", column: 1 });
    runUntilSettled(s);
    expect([s.status, s.lossReason]).toEqual(["lost", "deadlock"]);
  });

  it("agrees with brute force on random levels with TWO seals (several groups per key colour, waiting ones included)", () => {
    let compared = 0;
    for (let seed = 1; seed <= 3000 && compared < 60; seed++) {
      const base = randomLevel(seed, seed % 2 === 0);
      if (!base) continue;
      const first = sealRandom(base, seed);
      if (!first) continue;
      // A second seal: another colour's cubes, keyed by a different colour than the first.
      const used = new Set(first.seals![0]!.cells);
      const present = [...new Set(first.cells.filter((c) => c !== EMPTY))];
      const color = present[seed % present.length]!;
      const key = present[(seed + 1) % present.length]!;
      const cells = first.cells.flatMap((c, i) =>
        c === color && !used.has(i) && i % 4 === 1 ? [i] : [],
      );
      if (color === key || cells.length === 0) continue;
      const level = withSeals(first, [...first.seals!, { key, cells }]);
      if (validateCollectLevel(level).length > 0) continue;
      if (level.columns.reduce((n, c) => n + c.length, 0) > 6) continue;
      const reference = bruteSolve(level, 200_000, false);
      if (reference.status === "unknown") continue;
      expect(solve(level, 200_000).status, `seed ${seed}`).toBe(reference.status);
      compared++;
    }
    expect(compared).toBeGreaterThan(20);
  }, 180_000);
});

describe("solver with seals", () => {
  it("agrees with unmemoised brute force on random sealed levels, and every line wins", () => {
    let solved = 0;
    let unsolvable = 0;
    for (let seed = 1; seed <= 4000 && solved + unsolvable < 120; seed++) {
      const base = randomLevel(seed, seed % 2 === 0);
      const level = base ? sealRandom(base, seed) : null;
      if (!level) continue;
      if (level.columns.reduce((n, c) => n + c.length, 0) > 6) continue;
      const reference = bruteSolve(level, 200_000, false);
      if (reference.status === "unknown") continue;
      const result = new CollectSolver(level).solve(200_000);
      expect(result.status, `seed ${seed}`).toBe(reference.status);
      if (result.status === "solved") {
        solved++;
        const session = replayLine(level, result.line!);
        expect(session.state.status, `seed ${seed}`).toBe("won");
        expect(session.state.deliveredTotal).toBe(session.state.cubesTotal);
      } else unsolvable++;
    }
    expect(solved).toBeGreaterThan(30);
    expect(unsolvable).toBeGreaterThanOrEqual(3);
  }, 180_000);

  it("a seal is a real constraint: it can turn a solvable level unsolvable", () => {
    let tighter = 0;
    for (let seed = 1; seed <= 800 && tighter === 0; seed++) {
      const base = randomLevel(seed, seed % 2 === 0);
      const level = base ? sealRandom(base, seed) : null;
      if (!level || level.columns.reduce((n, c) => n + c.length, 0) > 6) continue;
      const { seals: _seals, ...plain } = level;
      if (solve(plain, 50_000).status === "solved" && solve(level, 50_000).status === "unsolvable")
        tighter++;
    }
    expect(tighter).toBeGreaterThan(0);
  }, 180_000);
});

describe("generating sealed levels", () => {
  /** Vertical bands: every colour touches the ring, so a seal can be met at the opening. */
  const bands = (w: number, h: number, n: number): GeneratorArt => ({
    width: w,
    height: h,
    palette: ["#e24a4a", "#4ae26b", "#4a6be2", "#e2c84a"].slice(0, n),
    cells: Array.from({ length: w * h }, (_, i) => Math.floor(((i % w) * n) / w)),
  });
  const gen = (art: GeneratorArt, seed: number, seals?: number) =>
    generateLevel(art, "gen", "Generated", {
      seed,
      profile: "gentle",
      maxAttempts: 6,
      refineSteps: 4,
      ...(seals === undefined ? {} : { seals }),
    });

  it("asking for seals: 0 is the same as not asking, and the output carries none", () => {
    const a = gen(bands(16, 16, 4), 3);
    expect(a).not.toBeNull();
    expect(gen(bands(16, 16, 4), 3, 0)).toEqual(a);
    expect(a!.level.seals).toBeUndefined();
  }, 120_000);

  it("adds solvable seals that meet the player at the opening, deterministically", () => {
    let kept = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const a = gen(bands(16, 16, 4), seed, 1);
      expect(gen(bands(16, 16, 4), seed, 1), `seed ${seed}`).toEqual(a);
      if (!a) continue;
      kept++;
      expect(a.level.seals).toHaveLength(1);
      expect(validateCollectLevel(a.level)).toEqual([]);
      expect(openingSealed(a.level), `seed ${seed}`).toBeGreaterThan(0);
      const result = solve(a.level, 50_000);
      expect(result.status, `seed ${seed}`).toBe("solved");
      expect(replayLine(a.level, result.line!).state.status).toBe("won");
    }
    expect(kept).toBeGreaterThan(0);
  }, 240_000);

  it("counts a sealed cube as not reachable when it reads a picture's openings", () => {
    const level = sealedRow();
    expect(reachableByColor(level)).toEqual([1, 1]);
    const { seals: _seals, ...plain } = level;
    expect(reachableByColor(plain)).toEqual([2, 1]);
  });

  it("gives up (null) for a one-colour picture: there is no key to seal with", () => {
    const one: GeneratorArt = {
      width: 12,
      height: 12,
      palette: ["#e24a4a"],
      cells: new Array<number>(144).fill(0),
    };
    expect(gen(one, 1, 1)).toBeNull();
  }, 120_000);
});
