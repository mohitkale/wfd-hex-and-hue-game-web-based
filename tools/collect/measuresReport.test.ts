import * as collect from "@hexhue/core/collect";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pieces } from "../../content/v2art";
import { decodeArtLevel, type ArtLevelData } from "../../packages/game/src/collect/artLevelCodec";
import { OUTPUT } from "../art/levels";
import { rows, table, tiersMet } from "./measuresReport";

/** M12.4 on the real levels: the measures, the score, and what is recorded for the generated ones. */

describe("the measures of the real levels", () => {
  const rs = rows();

  it("covers the slice and every art level, each with an inspectable score", () => {
    expect(rs.map((r) => r.id)).toEqual(["slice-moonlit-hat", ...pieces.map((p) => `art-${p.id}`)]);
    for (const r of rs) {
      expect(r.score.components).toHaveLength(collect.SCORE_SPEC.length);
      expect(r.score.total).toBeCloseTo(
        r.score.components.reduce((n, c) => n + c.points, 0),
        9,
      );
    }
  });

  it("the hand-designed slice has real decisions: it outscores every generated art level", () => {
    const slice = rs[0]!;
    expect(slice.m.doomedFirstShare).toBeGreaterThan(0);
    expect(slice.m.planningDepth).toBeGreaterThanOrEqual(2);
    expect(slice.m.deadEndShare).toBeGreaterThan(0);
    for (const art of rs.slice(1))
      expect(slice.score.total, art.id).toBeGreaterThan(art.score.total);
  });

  it("failure rates do not decide the ranking: the black cat fails random play 15 % of the time and still scores low", () => {
    const cat = rs.find((r) => r.id === "art-black-cat")!;
    expect(cat.m.randomRate).toBeLessThan(1);
    expect(cat.m.deadEndShare).toBe(0);
    expect(cat.score.total).toBeLessThan(20);
    // And the five levels random play never fails score no lower than their structure says.
    const flat = rs.find((r) => r.id === "art-crescent-moon")!;
    expect(flat.m.randomRate).toBe(1);
    expect(flat.score.total).toBeLessThan(cat.score.total);
  });

  it("prints a table with one row per level and the full-band verdicts", () => {
    const lines = table(rs).split("\n");
    expect(lines).toHaveLength(rs.length + 1);
    expect(lines[0]).toContain("planning");
    expect(lines[0]).toContain("full bands");
    expect(tiersMet(rs[1]!.m)).toEqual([]); // a decision-free level meets no full band (its tree measures fail)
  });
});

describe("what the pipeline records for the generated levels", () => {
  const data = JSON.parse(readFileSync(OUTPUT, "utf8")) as ArtLevelData[];

  it("is true: the recorded score, components and key measures equal a fresh measurement", () => {
    for (const d of data) {
      const level = decodeArtLevel(d);
      const m = collect.measureLevel(level)!;
      const score = collect.difficultyScore(m);
      const rec = d.generated!.difficulty;
      expect(rec.score, level.id).toBeCloseTo(score.total, 2);
      for (const c of score.components)
        expect(rec.components[c.id], `${level.id} ${c.id}`).toBeCloseTo(c.points, 2);
      expect(rec.measures.deadEndShare, level.id).toBeCloseTo(m.deadEndShare, 2);
      expect(rec.measures.hiddenColors, level.id).toBe(m.hiddenColors);
      expect(rec.measures.planningDepth, level.id).toBe(
        Number.isFinite(m.planningDepth) ? m.planningDepth : null,
      );
    }
    // Measuring every art level takes about 20 s alone: more than the 30 s default under load.
  }, 180_000);
});
