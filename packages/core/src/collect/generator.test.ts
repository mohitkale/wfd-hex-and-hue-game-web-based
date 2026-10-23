import { describe, expect, it } from "vitest";
import { EMPTY } from "../level";
import { board, randomLevel } from "./fixtures";
import {
  PROFILES,
  generateLevel,
  peel,
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
  generateLevel(art, "gen", "Generated", { seed, profile, maxAttempts });

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
    const few = generateLevel(art, "g", "g", { seed: 5, profile: "gentle", maxAttempts: 2 });
    const many = generateLevel(art, "g", "g", { seed: 5, profile: "gentle", maxAttempts: 12 });
    expect(few).not.toBeNull();
    expect(many!.score).toBeGreaterThanOrEqual(few!.score);
    expect(many!.acceptable).toBeGreaterThanOrEqual(few!.acceptable);
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
