import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BANDS,
  DETERMINISTIC_IDS,
  STRATEGY_IDS,
  TIERS,
  WORLD_WIN_SHARE_CAP,
  checkLevel,
  checkStrategies,
  checkWorld,
  simpleWins,
  tierForLevel,
  tiersSatisfied,
  type DeterministicId,
  type LevelMetrics,
  type Range,
  type Tier,
  type TierBand,
} from "./difficulty";

const allWin = Object.fromEntries(
  DETERMINISTIC_IDS.map((id) => [id, true]),
) as LevelMetrics["wins"];
const allLose = Object.fromEntries(
  DETERMINISTIC_IDS.map((id) => [id, false]),
) as LevelMetrics["wins"];

/** A level that sits comfortably inside the given tier (tutorial: a level-1 style lossless one). */
function good(tier: Tier): LevelMetrics {
  switch (tier) {
    case "tutorial":
      return {
        wins: allWin,
        randomRate: 0.95,
        reachableLoss: false,
        doomedFirstShare: 0,
        deadEndShare: 0,
        freeStepShare: 0.95,
        solutions: 6,
        winningShare: 0.9,
        slack: 3,
        recoveryDepth: 0,
        planningDepth: 1,
      };
    case "easy":
      return {
        wins: {
          ...allLose,
          "first-front": true,
          "last-front": true,
          "tidy-left": true,
          "tidy-right": true,
          largest: true,
        },
        randomRate: 0.7,
        reachableLoss: true,
        doomedFirstShare: 0.1,
        deadEndShare: 0.1,
        freeStepShare: 0.5,
        solutions: 4,
        winningShare: 0.7,
        slack: 2,
        recoveryDepth: 1,
        planningDepth: 1,
      };
    case "medium":
      return {
        wins: { ...allLose, largest: true, "most-delivered": true },
        randomRate: 0.25,
        reachableLoss: true,
        doomedFirstShare: 0.2,
        deadEndShare: 0.2,
        freeStepShare: 0.3,
        solutions: 3,
        winningShare: 0.3,
        slack: 1,
        recoveryDepth: 2,
        planningDepth: 3,
      };
    case "hard":
      return {
        wins: { ...allLose, smallest: true },
        randomRate: 0.1,
        reachableLoss: true,
        doomedFirstShare: 0.5,
        deadEndShare: 0.4,
        freeStepShare: 0.1,
        solutions: 1,
        winningShare: 0.1,
        slack: 0,
        recoveryDepth: 3,
        planningDepth: 4,
      };
  }
}

const levelFor = (tier: Tier) => (tier === "tutorial" ? 1 : undefined);

describe("difficulty bands: players and tiers", () => {
  it("defines nine deterministic players plus random", () => {
    expect(DETERMINISTIC_IDS).toHaveLength(9);
    expect(STRATEGY_IDS).toHaveLength(10);
    expect(DETERMINISTIC_IDS).not.toContain("random");
  });

  it("maps level numbers to tiers at the boundaries", () => {
    expect([1, 5, 6, 15, 16, 30, 31, 80].map(tierForLevel)).toEqual([
      "tutorial",
      "tutorial",
      "easy",
      "easy",
      "medium",
      "medium",
      "hard",
      "hard",
    ]);
    expect(() => tierForLevel(0)).toThrow();
    expect(() => tierForLevel(1.5)).toThrow();
  });

  it("counts simple wins", () => {
    expect(simpleWins({ wins: allWin })).toBe(9);
    expect(simpleWins({ wins: allLose })).toBe(0);
  });
});

describe("checkLevel", () => {
  it.each(TIERS)("a comfortable %s level passes", (tier) => {
    expect(checkLevel(good(tier), tier, levelFor(tier))).toEqual([]);
  });

  it.each([
    ["tutorial", "easy"],
    ["easy", "medium"],
    ["medium", "hard"],
  ] as const)("a comfortable %s level is rejected by the next tier (%s)", (tier, next) => {
    expect(checkLevel(good(tier), next, levelFor(next)).length).toBeGreaterThan(0);
  });

  it.each(["first-front", "last-front", "round-robin"] as const)(
    "column-spam %s must lose medium and hard levels",
    (id) => {
      for (const tier of ["medium", "hard"] as const) {
        const m = good(tier);
        const spam = { ...m, wins: { ...m.wins, [id]: true } };
        expect(checkLevel(spam, tier).join(), `${id} on ${tier}`).toContain(`${id} must lose`);
      }
    },
  );

  it.each(["tidy-left", "tidy-right", "most-delivered", "clears-capacity"] as const)(
    "%s must lose hard levels",
    (id) => {
      const m = good("hard");
      const bad = { ...m, wins: { ...m.wins, [id]: true } };
      expect(checkLevel(bad, "hard").join(), id).toContain(`${id} must lose`);
    },
  );

  it("rejects a medium level both greedy players beat", () => {
    const m = good("medium");
    const bad = { ...m, wins: { ...m.wins, "most-delivered": true, "clears-capacity": true } };
    expect(checkLevel(bad, "medium").join()).toContain("must not both win");
  });

  it("rejects a hard level that largest and smallest both win (via simpleWins)", () => {
    const m = good("hard");
    const bad = { ...m, wins: { ...m.wins, largest: true, smallest: true } };
    expect(checkLevel(bad, "hard").join()).toContain("simpleWins");
  });

  it("requires the tutorial opener to be winnable by first-front", () => {
    const m = good("tutorial");
    const bad = { ...m, wins: { ...m.wins, "first-front": false } };
    expect(checkLevel(bad, "tutorial", 1).join()).toContain("first-front must win");
  });

  it("rejects easy levels that are too easy, too hard or lossless", () => {
    const m = good("easy");
    expect(checkLevel({ ...m, randomRate: 0.99 }, "easy").join()).toContain("randomRate");
    expect(checkLevel({ ...m, wins: allWin }, "easy").join()).toContain("simpleWins");
    expect(checkLevel({ ...m, deadEndShare: 0 }, "easy").join()).toContain("deadEndShare");
    expect(checkLevel({ ...m, reachableLoss: false }, "easy").join()).toContain("reachable loss");
  });

  it("handles the lossless-tutorial rule and needs the level number", () => {
    const t = good("tutorial");
    const lossy = { ...t, reachableLoss: true, deadEndShare: 0.1 };
    expect(checkLevel(lossy, "tutorial", 2).join()).toContain("no reachable loss");
    expect(checkLevel(lossy, "tutorial", 4)).toEqual([]);
    expect(checkLevel(t, "tutorial", 4).join()).toContain("needs a reachable loss");
    expect(checkLevel(t, "tutorial").join()).toContain("level number");
  });

  it("requires a reachable loss outside the tutorial", () => {
    expect(checkLevel({ ...good("medium"), reachableLoss: false }, "medium").join()).toContain(
      "reachable loss",
    );
  });

  it("checks bounds inclusively at the edges", () => {
    const m = good("medium");
    expect(checkLevel({ ...m, randomRate: 0.05 }, "medium")).toEqual([]);
    expect(checkLevel({ ...m, randomRate: 0.45 }, "medium")).toEqual([]);
    expect(checkLevel({ ...m, randomRate: 0.451 }, "medium").join()).toContain("randomRate");
    expect(checkLevel({ ...m, randomRate: 0.049 }, "medium").join()).toContain("randomRate");
    expect(checkLevel({ ...good("hard"), slack: 1 }, "hard")).toEqual([]);
    expect(checkLevel({ ...good("hard"), slack: 2 }, "hard").join()).toContain("slack");
  });

  it("reports every violation, treats NaN as a failure, and handles planningDepth ∞", () => {
    const m: LevelMetrics = { ...good("hard"), randomRate: 0.6, slack: 3, planningDepth: Infinity };
    const out = checkLevel(m, "hard");
    for (const key of ["randomRate", "slack", "planningDepth"]) {
      expect(
        out.some((s) => s.startsWith(key)),
        key,
      ).toBe(true);
    }
    expect(checkLevel({ ...good("easy"), winningShare: NaN }, "easy").join()).toContain(
      "winningShare",
    );
  });

  it("tiers get strictly stricter about cheap play", () => {
    const maxWins = TIERS.map((t) => BANDS[t].simpleWins.max ?? 9);
    expect(maxWins[0]).toBeGreaterThan(maxWins[2]!);
    expect(maxWins[2]).toBeGreaterThan(maxWins[3]!);
    const random = TIERS.map((t) => BANDS[t].randomRate.max ?? 1);
    expect(random[0]).toBeGreaterThan(random[2]!);
    expect(random[2]).toBeGreaterThan(random[3]!);
    expect(BANDS.hard.mustLose.length).toBeGreaterThan(BANDS.medium.mustLose.length);
    for (const id of BANDS.medium.mustLose) expect(BANDS.hard.mustLose).toContain(id);
  });
});

describe("checkStrategies (the simple-player rules of a band)", () => {
  const wins = (...winners: DeterministicId[]) =>
    Object.fromEntries(
      DETERMINISTIC_IDS.map((id) => [id, winners.includes(id)]),
    ) as LevelMetrics["wins"];

  it("agrees with checkLevel on the player rules for every tier and the good levels", () => {
    for (const tier of TIERS) {
      const m = good(tier);
      expect(checkStrategies(m, tier)).toEqual([]);
      const level = tier === "tutorial" ? 1 : undefined;
      const viaLevel = checkLevel(m, tier, level).filter((p) =>
        /^(simpleWins|randomRate|.* must (win|lose)|.* and .* must not both win)/.test(p),
      );
      expect(viaLevel).toEqual([]);
    }
  });

  it("rejects medium and hard levels that column-spam wins", () => {
    for (const tier of ["medium", "hard"] as const) {
      for (const spam of ["first-front", "last-front", "round-robin"] as const) {
        const problems = checkStrategies({ wins: wins(spam), randomRate: 0.2 }, tier);
        expect(problems, `${tier} ${spam}`).toContain(`${spam} must lose ${tier} levels`);
      }
    }
  });

  it("does not penalise a clever human line: nothing here looks at the solver", () => {
    // A hard level that no cheap player wins is accepted however winnable it is.
    expect(checkStrategies({ wins: wins(), randomRate: 0.1 }, "hard")).toEqual([]);
  });

  it("lets tutorial and easy levels be easy, and shuts them out of medium", () => {
    const easyPlay = { wins: allWin, randomRate: 0.95 };
    expect(checkStrategies(easyPlay, "tutorial")).toEqual([]);
    expect(checkStrategies(easyPlay, "easy").join()).toContain("simpleWins 9");
    expect(checkStrategies(easyPlay, "medium").length).toBeGreaterThan(0);
    expect(tiersSatisfied(easyPlay)).toEqual(["tutorial"]);
    expect(tiersSatisfied({ wins: allLose, randomRate: 0.1 })).toEqual(["medium", "hard"]);
    expect(
      tiersSatisfied({
        wins: wins("largest", "smallest", "tidy-left", "tidy-right"),
        randomRate: 0.6,
      }),
    ).toEqual(["easy"]);
    // Random win rate in the gap between tiers fits none.
    expect(tiersSatisfied({ wins: allWin, randomRate: 0.5 })).toEqual([]);
  });

  it("treats a NaN random rate as a failure", () => {
    expect(checkStrategies({ wins: allWin, randomRate: Number.NaN }, "tutorial")).not.toEqual([]);
  });
});

describe("checkWorld", () => {
  const level = (tier: Tier, wins: Partial<Record<DeterministicId, boolean>>) => ({
    tier,
    metrics: { ...good(tier), wins: { ...allLose, ...wins } },
  });

  it("flags one player winning most of a world's medium levels", () => {
    const levels = [
      level("medium", { "clears-capacity": true }),
      level("medium", { "clears-capacity": true }),
      level("medium", { "clears-capacity": true }),
      level("medium", {}),
    ];
    expect(checkWorld(levels)).toEqual(["clears-capacity wins 3 of 4 medium levels (cap 50%)"]);
    expect(checkWorld(levels.slice(1))).toHaveLength(1);
    expect(checkWorld([levels[0]!, levels[3]!])).toEqual([]);
  });

  it("uses the lower cap on hard levels and ignores tiers without a cap", () => {
    const hard = [
      level("hard", { largest: true }),
      level("hard", {}),
      level("hard", {}),
      level("hard", {}),
    ];
    expect(checkWorld(hard)).toEqual([]);
    expect(
      checkWorld([level("hard", { largest: true }), level("hard", {}), level("hard", {})]),
    ).toHaveLength(1);
    expect(
      checkWorld([level("easy", { largest: true }), level("easy", { largest: true })]),
    ).toEqual([]);
    expect(WORLD_WIN_SHARE_CAP.hard!).toBeLessThan(WORLD_WIN_SHARE_CAP.medium!);
  });
});

// ---------------------------------------------------------------------------------------------
// Doc/code agreement: parse the tables in docs/DIFFICULTY_V2.md §5 and compare them with BANDS.
// ---------------------------------------------------------------------------------------------

const doc = readFileSync(new URL("../docs/DIFFICULTY_V2.md", import.meta.url), "utf8");

/** Rows of the markdown table that follows the first line starting with `header`. */
function tableRows(header: string): string[][] {
  const lines = doc.split("\n");
  const start = lines.findIndex((l) => l.startsWith(header));
  expect(start, `table starting "${header}"`).toBeGreaterThanOrEqual(0);
  const rows: string[][] = [];
  for (let i = start + 2; i < lines.length && lines[i]!.startsWith("|"); i++) {
    rows.push(
      lines[i]!.split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );
  }
  return rows;
}

function parseRange(cell: string): Range {
  const c = cell.replace(/\s+/g, " ").trim();
  if (c === "—") return {};
  let m = /^≥ ([\d.]+)$/.exec(c);
  if (m) return { min: Number(m[1]) };
  m = /^≤ ([\d.]+)$/.exec(c);
  if (m) return { max: Number(m[1]) };
  m = /^([\d.]+) – ([\d.]+)$/.exec(c);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  throw new Error(`unparseable range cell "${cell}"`);
}

const ids = (cell: string): string[] => [...cell.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]!);

describe("docs/DIFFICULTY_V2.md §5 matches BANDS", () => {
  const numeric: Record<string, keyof TierBand> = {
    "`simpleWins` (of 9)": "simpleWins",
    "`random` win rate": "randomRate",
    "`doomedFirstShare`": "doomedFirstShare",
    "`deadEndShare`": "deadEndShare",
    "`freeStepShare`": "freeStepShare",
    "`solutions`": "solutions",
    "`winningShare`": "winningShare",
    "`slack`": "slack",
    "`recoveryDepth`": "recoveryDepth",
    "`planningDepth`": "planningDepth",
  };

  it("numeric bands", () => {
    const rows = tableRows("| Requirement ");
    expect(rows.map((r) => r[0]).sort()).toEqual(Object.keys(numeric).sort());
    for (const row of rows) {
      const key = numeric[row[0]!]!;
      TIERS.forEach((tier, i) => {
        expect(parseRange(row[i + 1]!), `${key} / ${tier}`).toEqual(BANDS[tier][key]);
      });
    }
  });

  it("player rules and the reachable-loss rule", () => {
    const rows = Object.fromEntries(tableRows("| Rule ").map((r) => [r[0]!, r.slice(1)]));
    TIERS.forEach((tier, i) => {
      expect(ids(rows["Must win"]![i]!), `mustWin ${tier}`).toEqual([...BANDS[tier].mustWin]);
      expect(ids(rows["Must lose"]![i]!), `mustLose ${tier}`).toEqual([...BANDS[tier].mustLose]);
      expect(ids(rows["Must not both win"]![i]!), `notBothWin ${tier}`).toEqual(
        BANDS[tier].notBothWin.flat(),
      );
    });
    expect(rows["Reachable loss"]![0]).toContain("levels 1–3 never");
    expect(rows["Reachable loss"]!.slice(1)).toEqual(["required", "required", "required"]);
  });

  it("the documented world caps and level-to-tier mapping", () => {
    expect(doc).toContain("more than **50%** of a world's medium levels");
    expect(doc).toContain("more than **25%** of its\nhard levels");
    expect(WORLD_WIN_SHARE_CAP).toEqual({ medium: 0.5, hard: 0.25 });
    expect(doc).toContain("tutorial 1–5, easy 6–15, medium 16–30,\nhard 31+");
  });
});
