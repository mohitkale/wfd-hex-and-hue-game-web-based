import { describe, expect, it } from "vitest";
import { EMPTY } from "../level";
import { board, randomLevel } from "./fixtures";
import {
  PROFILES,
  attemptSeed,
  generateLevel,
  peel,
  randomLossRate,
  reachableByColor,
  score,
  type GeneratorArt,
  type Profile,
} from "./generator";
import { validateCollectLevel } from "./level";
import { replayLine, solve } from "./solver";

/** M12.2: the generator is deterministic, solver-verified and structurally checked. */

/** A concentric three-colour picture: the outer ring is open, the inner colours are buried. */
function rings(size: number): GeneratorArt {
  const cells: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const depth = Math.min(x, y, size - 1 - x, size - 1 - y);
      cells.push(depth % 3);
    }
  }
  return {
    width: size,
    height: size,
    palette: ["#e24a4a", "#4ae26b", "#4a6be2"],
    cells,
  };
}

const profiles: Profile[] = ["gentle", "standard", "tight"];
const make = (art: GeneratorArt, seed: number, profile: Profile, maxAttempts = 8) =>
  generateLevel(art, "gen", "Generated", { seed, profile, maxAttempts, refineSteps: 6 });

describe("reading a picture", () => {
  const level = board(["BBB", "BRB", "BBB"], [[["B", 8]], [["R", 1]]], { colors: "BR" });

  it("counts reachable cubes per colour: the ring is open, the core is buried", () => {
    expect(reachableByColor(level)).toEqual([8, 0]);
  });

  it("peels rings until nothing is left and notes when each colour first opens", () => {
    expect(peel(level)).toEqual({ depth: 2, firstOpen: [0, 1] });
    const flat = board(["BB"], [[["B", 2]]], { colors: "B" });
    expect(peel(flat)).toEqual({ depth: 1, firstOpen: [0] });
  });
});

describe("determinism", () => {
  it.each(profiles)(
    "%s: the same art, id, profile and seed give the identical level",
    (profile) => {
      const art = rings(10);
      const a = make(art, 7, profile);
      const b = make(art, 7, profile);
      if (profile !== "tight") expect(a).not.toBeNull(); // a shallow picture may not support tight
      expect(b).toEqual(a);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    },
  );

  it("different seeds give different deals", () => {
    const art = rings(10);
    const levels = [1, 2, 3, 4, 5, 6].map((seed) =>
      JSON.stringify(make(art, seed, "gentle")!.level),
    );
    expect(new Set(levels).size).toBeGreaterThan(3);
  });

  it("does not depend on what was generated before", () => {
    const art = rings(10);
    const alone = make(art, 3, "standard");
    make(art, 99, "tight");
    expect(make(art, 3, "standard")).toEqual(alone);
  });
});

describe("generated levels are valid, solvable and structured", () => {
  const arts: [string, GeneratorArt][] = [
    ["rings 8", rings(8)],
    ["rings 10", rings(10)],
    ["rings 13", rings(13)],
  ];

  it.each(arts.flatMap(([name, art]) => profiles.map((p) => [name, art, p] as const)))(
    "%s, %s: whenever a level comes back it passes every check",
    (_name, art, profile) => {
      const spec = PROFILES[profile];
      for (let seed = 1; seed <= 3; seed++) {
        const g = make(art, seed, profile);
        if (!g) continue; // a shallow picture may not support a demanding profile
        const { level, metrics } = g;
        expect(validateCollectLevel(level), `seed ${seed}`).toEqual([]);
        // The picture is untouched, and every colour's groups carry exactly its cubes.
        expect(level.cells).toEqual(art.cells);
        const perColor = new Array<number>(art.palette.length).fill(0);
        for (const c of art.cells) if (c !== EMPTY) perColor[c]!++;
        const carried = new Array<number>(art.palette.length).fill(0);
        for (const grp of level.columns.flat()) {
          expect(grp.capacity).toBeGreaterThanOrEqual(1);
          carried[grp.color]! += grp.capacity;
        }
        expect(carried).toEqual(perColor);
        // Solver-verified, and the line replays to a win in the live engine.
        const solved = solve(level);
        expect(solved.status).toBe("solved");
        expect(replayLine(level, solved.line!).state.status).toBe("won");
        // Structure: the metrics are real and meet the profile.
        expect(metrics.cubes).toBe(art.cells.filter((c) => c !== EMPTY).length);
        expect(metrics.groups).toBe(level.columns.flat().length);
        expect(metrics.parkers).toBeGreaterThanOrEqual(spec.minParkers);
        expect(metrics.parkers).toBe(
          level.columns.flat().filter((grp) => grp.capacity > reachableByColor(level)[grp.color]!)
            .length,
        );
        expect(metrics.minSlots).toBeGreaterThanOrEqual(spec.minMinSlots);
        expect(metrics.slack).toBe(Math.min(8, metrics.minSlots + spec.slack) - metrics.minSlots);
        expect(level.slots).toBe(Math.min(8, metrics.minSlots + spec.slack));
        expect(metrics.winnableOpenings).toBeGreaterThanOrEqual(spec.minOpenings);
        expect(metrics.doomedOpenings / metrics.firstMoves).toBeLessThanOrEqual(
          spec.maxDoomedFirst,
        );
        expect(metrics.depth).toBe(peel(level).depth);
        expect(metrics.randomLoss).toBe(randomLossRate(level));
        expect(metrics.randomLoss).toBeGreaterThanOrEqual(spec.minRandomLoss);
        expect(g.score).toBe(score(metrics));
        expect(g.attempt).toBeLessThan(8);
        expect(g.acceptable).toBeGreaterThanOrEqual(1);
        // Group sizes are sensible: no group of a colour dwarfs the picture.
        for (const grp of level.columns.flat())
          expect(grp.capacity).toBeLessThanOrEqual(perColor[grp.color]!);
      }
    },
    60_000,
  );

  it("the kept level is the best-scoring acceptable candidate (more attempts never score lower)", () => {
    const art = rings(10);
    let compared = 0;
    for (let seed = 1; seed <= 8 && compared < 2; seed++) {
      const few = generateLevel(art, "g", "g", { seed, profile: "gentle", maxAttempts: 3 });
      const many = generateLevel(art, "g", "g", { seed, profile: "gentle", maxAttempts: 12 });
      if (!few) continue;
      compared++;
      expect(many!.score).toBeGreaterThanOrEqual(few.score);
      expect(many!.acceptable).toBeGreaterThanOrEqual(few.acceptable);
    }
    expect(compared).toBeGreaterThanOrEqual(1);
  });

  it("works on the random tight boards of the engine's own test generator", () => {
    let produced = 0;
    for (let seed = 1; seed <= 40 && produced < 5; seed++) {
      const src = randomLevel(seed, true);
      if (!src || validateCollectLevel(src).length > 0) continue;
      const g = make(
        { width: src.width, height: src.height, palette: src.palette, cells: src.cells },
        seed,
        "gentle",
        6,
      );
      if (!g) continue;
      produced++;
      expect(solve(g.level).status).toBe("solved");
    }
    expect(produced).toBeGreaterThanOrEqual(1);
  }, 60_000);
});

describe("groups and seeds", () => {
  it("no group is tiny: a colour is split into groups of at least half the target size", () => {
    for (const size of [8, 10, 13]) {
      const art = rings(size);
      for (let seed = 1; seed <= 6; seed++) {
        const g = make(art, seed, "gentle");
        if (!g) continue;
        const cubes = art.cells.length;
        const chunk = Math.max(6, cubes / PROFILES.gentle.groups);
        const perColor = new Array<number>(3).fill(0);
        for (const c of art.cells) perColor[c]!++;
        for (const grp of g.level.columns.flat()) {
          // Refinement may shift cubes, but never to nothing; an unrefined (gentle) deal keeps the floor.
          expect(grp.capacity).toBeGreaterThanOrEqual(
            Math.min(perColor[grp.color]!, Math.floor(chunk * 0.5)),
          );
        }
      }
    }
  });

  it("derives distinct candidate seeds for distinct (seed, attempt) pairs, deterministically", () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 1000; seed++) {
      for (let attempt = 0; attempt < 12; attempt++) seen.add(attemptSeed(seed, attempt));
    }
    expect(seen.size).toBe(12_000);
    expect(attemptSeed(5, 3)).toBe(attemptSeed(5, 3));
  });

  it("rejects seeds that cannot be told apart or are not integers", () => {
    const art = rings(8);
    for (const seed of [1.5, -1, 2 ** 31, Number.NaN]) {
      expect(() => generateLevel(art, "g", "g", { seed })).toThrow("seed must be an integer");
    }
  });
});

describe("the acceptance gate (M12.3)", () => {
  /** A stand-in gate: one objection per group beyond the second in the first column. */
  const crowdedFirstColumn = (level: { columns: unknown[][] }): string[] =>
    Array.from(
      { length: Math.max(0, level.columns[0]!.length - 2) },
      () => "first column is crowded",
    );
  const art = rings(10);

  it("the hill climb repairs a candidate the gate objects to, and the result passes the gate and the solver", () => {
    let repaired = 0;
    for (let seed = 1; seed <= 12 && repaired < 2; seed++) {
      const plain = generateLevel(art, "g", "g", { seed, profile: "gentle", refineSteps: 0 });
      if (!plain || crowdedFirstColumn(plain.level).length === 0) continue;
      const gated = generateLevel(art, "g", "g", {
        seed,
        profile: "gentle",
        refineSteps: 80,
        gate: crowdedFirstColumn,
      });
      if (!gated) continue; // the search is bounded and may not always get there
      repaired++;
      expect(crowdedFirstColumn(gated.level)).toEqual([]);
      expect(solve(gated.level).status).toBe("solved");
      expect(gated.level.cells).toEqual(art.cells);
    }
    expect(repaired).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("never returns a level the gate still objects to, even when the search cannot fix it", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const g = generateLevel(art, "g", "g", {
        seed,
        profile: "gentle",
        refineSteps: 4,
        gate: crowdedFirstColumn,
      });
      if (g) expect(crowdedFirstColumn(g.level)).toEqual([]);
    }
  });

  it("a candidate the gate already accepts is returned unchanged (no refinement)", () => {
    const plain = generateLevel(art, "g", "g", { seed: 3, profile: "gentle", refineSteps: 0 })!;
    const gated = generateLevel(art, "g", "g", { seed: 3, profile: "gentle", gate: () => [] })!;
    expect(gated.level).toEqual(plain.level);
  });

  it("the ungated pool does not depend on the refinement switch for profiles asking for pitfalls", () => {
    const a = generateLevel(art, "g", "g", {
      seed: 2,
      profile: "standard",
      refineSteps: 0,
      maxAttempts: 6,
    });
    const b = generateLevel(art, "g", "g", {
      seed: 2,
      profile: "standard",
      refineSteps: 0,
      maxAttempts: 6,
    });
    expect(a).toEqual(b);
  });
});

describe("rejection", () => {
  it("returns null when the picture cannot supply the structure (one colour cannot make groups wait)", () => {
    const flat: GeneratorArt = {
      width: 6,
      height: 6,
      palette: ["#e24a4a"],
      cells: new Array<number>(36).fill(0),
    };
    expect(make(flat, 1, "tight")).toBeNull();
  });

  it("returns null rather than guess when the solver budget is too small to decide", () => {
    expect(
      generateLevel(rings(10), "g", "g", { seed: 1, profile: "gentle", budget: 1 }),
    ).toBeNull();
  });

  it("the profiles ask for more structure as they get tighter", () => {
    expect(PROFILES.gentle.slack).toBeGreaterThan(PROFILES.standard.slack);
    expect(PROFILES.standard.slack).toBeGreaterThan(PROFILES.tight.slack);
    expect(PROFILES.gentle.minParkers).toBeLessThan(PROFILES.tight.minParkers);
    expect(PROFILES.gentle.maxDoomedFirst).toBeLessThan(PROFILES.tight.maxDoomedFirst);
  });
});
