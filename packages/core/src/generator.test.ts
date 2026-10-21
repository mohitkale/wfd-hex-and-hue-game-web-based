import { describe, expect, it } from "vitest";
import { EMPTY, countFragments, validateLevel } from "./level";
import { createRng } from "./rng";
import { verifySolution } from "./solver";
import {
  fixedChunks,
  generateLevel,
  naturalSequence,
  type Art,
  type GenerateOptions,
} from "./generator";

/** 14×14 crescent moon (0) with stars (2) on a night sky (1), corners left empty. */
function moonArt(): Art {
  const size = 14;
  const cells: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const outer = (x - 6.5) ** 2 + (y - 6.5) ** 2 <= 30;
      const bite = (x - 8.5) ** 2 + (y - 5.5) ** 2 <= 18;
      const star = (x * 7 + y * 3) % 17 === 0;
      const corner = (x < 1 || x > 12) && (y < 1 || y > 12);
      cells.push(corner ? EMPTY : outer && !bite ? 0 : star ? 2 : 1);
    }
  }
  return { width: size, height: size, palette: ["#f6d97a", "#2a1650", "#c9b8ff"], cells };
}

const base: GenerateOptions = {
  seed: 7,
  columns: 3,
  slots: 5,
  trackCap: 5,
  chunk: { min: 6, max: 14 },
  shuffle: 0.3,
  attempts: 6,
  playouts: 30,
};

describe("naturalSequence", () => {
  it("covers every fragment exactly, with charges in range except forced small ones", () => {
    const art = moonArt();
    const seq = naturalSequence(art, createRng(1), base.chunk);
    const totals = new Array<number>(art.palette.length).fill(0);
    for (const w of seq) totals[w.color]! += w.charge;
    expect(totals).toEqual(countFragments(art));
    for (const w of seq) {
      expect(w.charge).toBeGreaterThanOrEqual(1);
      // A wisp may take a whole small remainder of its color, slightly above max.
      expect(w.charge).toBeLessThan(base.chunk.max + base.chunk.min);
    }
  });

  it("is deterministic for a seed", () => {
    const a = naturalSequence(moonArt(), createRng(3), base.chunk);
    const b = naturalSequence(moonArt(), createRng(3), base.chunk);
    expect(a).toEqual(b);
  });
});

describe("fixedChunks", () => {
  it("re-splits each color into chunk-sized wisps covering the same totals", () => {
    const art = moonArt();
    const natural = naturalSequence(art, createRng(1), base.chunk);
    const fixed = fixedChunks(natural, createRng(2), base.chunk);
    const totals = new Array<number>(art.palette.length).fill(0);
    for (const w of fixed) totals[w.color]! += w.charge;
    expect(totals).toEqual(countFragments(art));
    const counts = countFragments(art);
    for (const w of fixed) {
      // Only a color smaller than chunk.min may produce a wisp below it.
      if (counts[w.color]! >= base.chunk.min)
        expect(w.charge).toBeGreaterThanOrEqual(base.chunk.min);
      expect(w.charge).toBeLessThan(base.chunk.max + base.chunk.min);
    }
  });
});

describe("generateLevel", () => {
  it("produces a valid, solver-verified level with the requested shape", () => {
    const g = generateLevel(moonArt(), { id: "moon-1", name: "Crescent" }, base);
    expect(validateLevel(g.level)).toEqual([]);
    expect(g.level).toMatchObject({ id: "moon-1", name: "Crescent", slots: 5, trackCap: 5 });
    expect(g.level.columns).toHaveLength(3);
    expect(g.report.solve.status).toBe("solved");
    expect(verifySolution(g.level, g.solution)).toBe(true);
  });

  it("is deterministic for a seed and varies across seeds", () => {
    const a = generateLevel(moonArt(), { id: "m", name: "m" }, base);
    const b = generateLevel(moonArt(), { id: "m", name: "m" }, base);
    const c = generateLevel(moonArt(), { id: "m", name: "m" }, { ...base, seed: 8 });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(JSON.stringify(a.level.columns)).not.toEqual(JSON.stringify(c.level.columns));
  });

  it("with no shuffle stays solvable with a single holding slot", () => {
    const g = generateLevel(moonArt(), { id: "m", name: "m" }, { ...base, shuffle: 0, slots: 1 });
    expect(g.report.minSlots).toBe(1);
    expect(verifySolution(g.level, g.solution)).toBe(true);
  });

  it("hits a target difficulty with fixed charges and refinement", () => {
    const opts: GenerateOptions = {
      ...base,
      slots: 3,
      charges: "fixed",
      shuffle: 0.5,
      playouts: 30,
    };
    for (const target of [0.1, 0.3]) {
      const g = generateLevel(
        moonArt(),
        { id: "m", name: "m" },
        { ...opts, targetDifficulty: target },
      );
      expect(Math.abs(g.report.difficulty - target)).toBeLessThan(0.1);
      expect(verifySolution(g.level, g.solution)).toBe(true);
      expect(validateLevel(g.level)).toEqual([]);
    }
  }, 30_000);

  it("never returns an unsolvable level even with a hostile setup", () => {
    const g = generateLevel(
      moonArt(),
      { id: "m", name: "m" },
      { ...base, shuffle: 1, slots: 1, columns: 5, attempts: 4 },
    );
    expect(verifySolution(g.level, g.solution)).toBe(true);
  });
});
