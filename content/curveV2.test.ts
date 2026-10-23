import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LENGTH_STEP_CAP,
  MAX_CUBES,
  MAX_SECONDS,
  MIN_STAGE_STEP,
  STAGES,
  STAGE_MEASURES,
  checkCurve,
  checkEntry,
  stageForLevel,
  type CurveEntry,
  type Stage,
} from "./curveV2";
import {
  BANDS,
  DETERMINISTIC_IDS,
  TIERS,
  WORLD_WIN_SHARE_CAP,
  tierForLevel,
  type DeterministicId,
} from "./difficulty";

const wins = (...winners: DeterministicId[]) =>
  Object.fromEntries(DETERMINISTIC_IDS.map((id) => [id, winners.includes(id)])) as Record<
    DeterministicId,
    boolean
  >;

/** An entry that sits inside its stage: tier rules met, score mid-band, every requirement met. */
function good(level: number, id = `l${level}`): CurveEntry {
  const stage = stageForLevel(level);
  const m: Record<string, number> = {
    score:
      ((stage.score.min ?? 0) + Math.min(stage.score.max ?? 100, (stage.score.min ?? 0) + 30)) / 2,
    deadEndShare: 0.2,
    temptingPoorShare: 0.1,
    doomedFirstShare: 0.2,
    planningDepth: 3,
    hiddenColors: 2,
    slotPressure: 0.5,
    seconds: 200,
  };
  const strategies =
    stage.tier === "tutorial"
      ? { wins: wins(...DETERMINISTIC_IDS), randomRate: 0.9 }
      : stage.tier === "easy"
        ? { wins: wins("largest", "smallest", "tidy-left", "tidy-right"), randomRate: 0.6 }
        : { wins: wins(), randomRate: 0.1 };
  return {
    level,
    id,
    cubes: 400,
    measures: m as CurveEntry["measures"],
    strategies,
    reachableLoss: !(stage.tier === "tutorial" && level <= 3),
  };
}

describe("the stages are a valid schema", () => {
  it("cover levels 1 and up without gaps or overlap, ending open", () => {
    expect(STAGES[0]!.from).toBe(1);
    for (let i = 1; i < STAGES.length; i++)
      expect(STAGES[i]!.from, STAGES[i]!.id).toBe(STAGES[i - 1]!.to + 1);
    expect(STAGES.at(-1)!.to).toBe(Number.POSITIVE_INFINITY);
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(STAGES.length);
    for (const s of STAGES) expect(s.to, s.id).toBeGreaterThanOrEqual(s.from);
  });

  it("maps levels at the boundaries and rejects invalid numbers", () => {
    const at = (n: number) => stageForLevel(n).id;
    expect([1, 5, 6, 15, 16, 30, 31, 50, 51, 1000].map(at)).toEqual([
      "learn",
      "learn",
      "blocked-and-slots",
      "blocked-and-slots",
      "partial-and-dependencies",
      "partial-and-dependencies",
      "ordering",
      "ordering",
      "advanced",
      "advanced",
    ]);
    for (const bad of [0, -1, 1.5, Number.NaN])
      expect(() => stageForLevel(bad)).toThrow("invalid level number");
  });

  it("agrees with the difficulty document's level-to-tier mapping for every level", () => {
    for (let n = 1; n <= 200; n++)
      expect(stageForLevel(n).tier, `level ${n}`).toBe(tierForLevel(n));
  });

  it("takes each stage's tier from the one level-to-tier mapping: it changes only at stage boundaries", () => {
    for (const s of STAGES) {
      const last = Number.isFinite(s.to) ? s.to : s.from + 100;
      for (let n = s.from; n <= last; n++)
        expect(tierForLevel(n), `${s.id} level ${n}`).toBe(s.tier);
    }
  });

  it("states requirements no looser than the tier band for the measures both name", () => {
    for (const s of STAGES) {
      const band = BANDS[s.tier];
      for (const r of s.requires) {
        const tierRange = (band as unknown as Record<string, { min?: number; max?: number }>)[
          r.measure
        ];
        if (!tierRange) continue; // the measure is not part of the tier table (score, hiddenColors, ...)
        if (tierRange.min !== undefined)
          expect(r.min ?? -Infinity, `${s.id} ${r.measure} min`).toBeGreaterThanOrEqual(
            tierRange.min,
          );
        if (tierRange.max !== undefined)
          expect(r.max ?? Infinity, `${s.id} ${r.measure} max`).toBeLessThanOrEqual(tierRange.max);
      }
    }
  });

  it("is monotone: bands and requirements get stricter, tiers never get easier", () => {
    for (let i = 1; i < STAGES.length; i++) {
      const a = STAGES[i - 1]!;
      const b = STAGES[i]!;
      expect(b.score.min!, `${b.id} score min`).toBeGreaterThanOrEqual(a.score.min!);
      expect(b.score.max!, `${b.id} score max`).toBeGreaterThanOrEqual(a.score.max!);
      expect(TIERS.indexOf(b.tier), b.id).toBeGreaterThanOrEqual(TIERS.indexOf(a.tier));
      for (const r of a.requires) {
        const later = b.requires.find((x) => x.measure === r.measure);
        if (later && r.min !== undefined)
          expect(later.min!, `${b.id} ${r.measure}`).toBeGreaterThanOrEqual(r.min);
      }
    }
  });

  it("every band is a proper range and every requirement names a known measure with a reason", () => {
    for (const s of STAGES) {
      expect(s.score.min!).toBeLessThanOrEqual(s.score.max!);
      expect(s.teaches.length).toBeGreaterThan(10);
      for (const r of s.requires) {
        expect(STAGE_MEASURES).toContain(r.measure);
        expect(r.why.length).toBeGreaterThan(5);
        expect(r.min !== undefined || r.max !== undefined).toBe(true);
      }
    }
  });

  it("never lets length be the way up: the caps are the same for every stage and length is not a scored measure", () => {
    expect(MAX_SECONDS).toBeGreaterThan(0);
    expect(MAX_CUBES).toBeGreaterThan(0);
    for (const s of STAGES)
      for (const r of s.requires) expect(["seconds", "cubes"]).not.toContain(r.measure);
  });
});

describe("checkEntry", () => {
  it.each([1, 3, 4, 5, 6, 15, 16, 30, 31, 50, 51, 80])("a well-placed level %i passes", (n) => {
    expect(checkEntry(good(n))).toEqual([]);
  });

  it("flags a score outside the stage's band, too low or too high", () => {
    const low = good(31);
    low.measures = { ...low.measures, score: 10 };
    expect(checkEntry(low).join()).toContain("score 10 outside 35..75");
    const high = good(2);
    high.measures = { ...high.measures, score: 60 };
    expect(checkEntry(high).join()).toContain("score 60 outside 0..20");
  });

  it("rejects a planning depth of infinity (no lookahead wins): it is not a requirement met", () => {
    const e = good(40);
    e.measures = { ...e.measures, planningDepth: Number.POSITIVE_INFINITY };
    expect(checkEntry(e).join()).toContain("planningDepth ∞ outside 3..5");
  });

  it("flags a missing decision: no blocked colour in stage 2, no tempting choice in stage 4", () => {
    const e = good(7);
    e.measures = { ...e.measures, hiddenColors: 0 };
    expect(checkEntry(e).join()).toContain(
      "hiddenColors 0 outside 1..∞: blocked colours must be present",
    );
    const f = good(40);
    f.measures = { ...f.measures, temptingPoorShare: 0 };
    expect(checkEntry(f).join()).toContain("temptingPoorShare");
    const g = good(60);
    g.measures = { ...g.measures, planningDepth: 2 };
    expect(checkEntry(g).join()).toContain("planningDepth 2 outside 3..5");
  });

  it("rejects medium and hard levels that column-spam wins (the tier's player rules)", () => {
    for (const n of [20, 40]) {
      const e = good(n);
      e.strategies = { wins: wins("first-front"), randomRate: 0.1 };
      expect(checkEntry(e).join(), `level ${n}`).toContain("first-front must lose");
    }
  });

  it("applies the loss rules: lossless 1-3, a loss in 4-5, a loss from then on", () => {
    expect(checkEntry({ ...good(2), reachableLoss: true }).join()).toContain(
      "levels 1-3 must have no reachable loss",
    );
    expect(checkEntry({ ...good(4), reachableLoss: false }).join()).toContain(
      "levels 4-5 need a reachable loss",
    );
    expect(checkEntry({ ...good(12), reachableLoss: false }).join()).toContain(
      "must be able to cost something",
    );
  });

  it("enforces the same length caps in every stage", () => {
    for (const n of [1, 20, 60]) {
      const long = good(n);
      long.measures = { ...long.measures, seconds: MAX_SECONDS + 1 };
      expect(checkEntry(long).join(), `level ${n}`).toContain("length cap");
      expect(checkEntry({ ...good(n), cubes: MAX_CUBES + 1 }).join(), `level ${n}`).toContain(
        "cube cap",
      );
    }
  });

  it("treats a NaN length as over the cap, not as passing it", () => {
    const e = good(6);
    e.measures = { ...e.measures, seconds: Number.NaN };
    expect(checkEntry(e).join()).toContain("length cap");
    expect(checkEntry({ ...good(6), cubes: Number.NaN }).join()).toContain("cube cap");
  });

  it("treats NaN as a deviation", () => {
    const e = good(6);
    e.measures = { ...e.measures, score: Number.NaN };
    expect(checkEntry(e).length).toBeGreaterThan(0);
  });
});

describe("checkCurve", () => {
  it("accepts a world whose stages rise, in any order of listing", () => {
    const world = [good(1), good(8), good(20), good(40), good(55)];
    expect(checkCurve(world)).toEqual([]);
    expect(checkCurve([...world].reverse())).toEqual([]);
  });

  it("rejects a level number used twice", () => {
    expect(checkCurve([good(3), { ...good(3), id: "other" }]).join()).toContain(
      "level 3 is used twice",
    );
  });

  it("rejects stages that do not rise by the required step", () => {
    const flat = (n: number, score: number): CurveEntry => {
      const e = good(n);
      e.measures = { ...e.measures, score };
      return e;
    };
    // Stage 2 and 3 scores that overlap their bands but do not rise enough.
    const problems = checkCurve([flat(7, 30), flat(20, 30 + MIN_STAGE_STEP - 1)]);
    expect(problems.join()).toContain("must rise at least");
    expect(checkCurve([flat(7, 30), flat(20, 30 + MIN_STAGE_STEP)])).toEqual([]);
  });

  it("rejects a stage that takes much longer, or has many more cubes, than the one before (difficulty is not length)", () => {
    const longer = (n: number, seconds: number, cubes: number): CurveEntry => {
      const e = good(n);
      e.measures = { ...e.measures, seconds };
      return { ...e, cubes };
    };
    const base = checkCurve([
      longer(2, 100, 300),
      longer(8, 100 * LENGTH_STEP_CAP, 300 * LENGTH_STEP_CAP),
    ]);
    expect(base).toEqual([]);
    const slow = checkCurve([longer(2, 100, 300), longer(8, 100 * LENGTH_STEP_CAP + 1, 300)]);
    expect(slow.join()).toContain("difficulty must not come from length");
    const big = checkCurve([longer(2, 100, 300), longer(8, 100, 300 * LENGTH_STEP_CAP + 1)]);
    expect(big.join()).toContain("difficulty must not come from more cubes");
  });

  it("applies the world-level repetition caps: one cheap player winning most of a tier's levels is rejected", () => {
    // Hard levels where `largest` wins: the cap is 25 %, but the hard tier's own rule already rejects it.
    expect(WORLD_WIN_SHARE_CAP.hard).toBe(0.25);
    const hardEntries = [31, 32, 33, 34].map((n) => good(n));
    expect(checkCurve(hardEntries)).toEqual([]);
    const mediumWins: CurveEntry[] = [16, 17, 18, 19].map((n) => {
      const e = good(n);
      return { ...e, strategies: { ...e.strategies, wins: wins("largest") } };
    });
    expect(checkCurve(mediumWins).join()).toContain("largest wins 4 of 4 medium levels");
  });

  it("accepts a partly filled world (a library placed piece by piece) and an empty one", () => {
    expect(checkCurve([good(1), good(2), good(6)])).toEqual([]);
    expect(checkCurve([])).toEqual([]);
  });

  it("reports every problem, not just the first", () => {
    const bad = good(31);
    bad.measures = { ...bad.measures, score: 5, planningDepth: 1 };
    expect(checkCurve([bad]).length).toBeGreaterThanOrEqual(2);
  });
});

describe("docs/V2_CURVE.md matches the code", () => {
  const doc = readFileSync(new URL("../docs/V2_CURVE.md", import.meta.url), "utf8");
  const rows = (): string[][] => {
    const lines = doc.split("\n");
    const start = lines.findIndex((l) => l.startsWith("| Stage "));
    const out: string[][] = [];
    for (let i = start + 2; i < lines.length && lines[i]!.startsWith("|"); i++) {
      out.push(
        lines[i]!.split("|")
          .slice(1, -1)
          .map((c) => c.trim()),
      );
    }
    return out;
  };
  const range = (cell: string): [number, number] => {
    const m = /^(\d+)(?:–(\d+)|\+)?$/.exec(cell)!;
    return [Number(m[1]), m[2] ? Number(m[2]) : Number(m[1])];
  };
  const requires = (s: Stage): string =>
    s.requires.length === 0
      ? "nothing beyond the tier"
      : s.requires
          .map((r) =>
            r.max === undefined ? `${r.measure} ≥ ${r.min}` : `${r.measure} ${r.min}–${r.max}`,
          )
          .join("; ");

  it("lists every stage with its levels, tier, score band and requirements", () => {
    const table = rows();
    expect(table).toHaveLength(STAGES.length);
    STAGES.forEach((s, i) => {
      const [name, levels, tier, score, req] = table[i]!;
      expect(name, s.id).toBe(s.name);
      const [from, to] = range(levels!);
      expect(from).toBe(s.from);
      if (Number.isFinite(s.to)) expect(to).toBe(s.to);
      else expect(levels).toMatch(/\+$/);
      expect(tier).toBe(s.tier);
      expect(score).toBe(`${s.score.min}–${s.score.max}`);
      expect(req).toBe(requires(s));
    });
  });

  it("states the shared length caps and the stage step", () => {
    expect(doc).toContain(`**${MAX_SECONDS} s**`);
    expect(doc).toContain(`**${MAX_CUBES} cubes**`);
    expect(doc).toContain(`**${MIN_STAGE_STEP} points**`);
    expect(doc).toContain(`**${LENGTH_STEP_CAP}x**`);
  });
});
