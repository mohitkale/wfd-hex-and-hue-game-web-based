import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { KNOWN_WORLD_ISSUES, POOL, type PoolLevel } from "../../content/poolV2";
import { SHIPPED } from "../../content/v2art";
import { board, fixtureB } from "../../packages/core/src/collect/fixtures";
import { EXTRA_LEVEL, PREVIEW_LEVEL } from "../art/placement";
import { reportHtml, reportLevel, reportPool } from "./levelGate";
import { run } from "./levelsV2";
import { loadPoolLevel } from "./poolLoad";

/** M12.6: the gate passes good levels and today's recorded debt, and fails bad fixtures. */

/** Fixture B with room for every waiting group: a small level that meets the whole tutorial band. */
const goodLevel = (): collect.CollectLevel => ({
  ...fixtureB(),
  id: "good",
  name: "Good",
  slots: 3,
});

/** A level the solver proves cannot be won (the first move parks, the second overflows). */
const unwinnable = (): collect.CollectLevel => ({
  ...board(
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
  ),
  id: "unwinnable",
  name: "Unwinnable",
});

const entry = (id: string, level: number, known: PoolLevel["knownIssues"] = []): PoolLevel => ({
  id,
  level,
  knownIssues: known,
});
const fixtures: Record<string, collect.CollectLevel> = {
  good: goodLevel(),
  unwinnable: unwinnable(),
};
const load = (id: string) => fixtures[id] ?? loadPoolLevel(id);

describe("a good level", () => {
  it("meets its whole tier band and the curve: no issues, no recorded debt", () => {
    const r = reportLevel(entry("good", 1), goodLevel());
    expect(r.issues).toEqual([]);
    expect(r.solved).toBe(true);
    expect(r.line.length).toBeGreaterThan(0);
    expect(r.tier).toBe("tutorial");
    expect(r).toMatchObject({ cubes: 20, colors: 3, groups: 3, slots: 3 });
  });

  it("passes the gate and exits 0", () => {
    const result = run([entry("good", 1)], load, [], ["--check"]);
    expect(result.code).toBe(0);
    expect(result.err).toEqual([]);
  });
});

describe("bad fixtures fail the gate (and so CI: exit code 1)", () => {
  it("an unsolvable level fails, and cannot be waived", () => {
    const r = reportLevel(
      entry("unwinnable", 1, [
        { message: "the solver proves the level cannot be won", reason: "trying to waive it" },
      ]),
      unwinnable(),
    );
    expect(r.solved).toBe(false);
    expect(r.issues.map((i) => i.kind)).toContain("unsolvable");
    expect(r.issues.find((i) => i.kind === "unsolvable")!.waived).toBe(false);
    const result = run([entry("unwinnable", 1)], load, [], ["--check"]);
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain("unsolvable");
  });

  it("a trivial level where the tier forbids it fails: column-spam beats a medium level", () => {
    // The good level is won by every cheap player, so it is trivial at level 16 (medium).
    const result = run([entry("good", 16)], load, [], ["--check"]);
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toMatch(/trivial: first-front must lose medium levels/);
  });

  it("trivial levels cannot be waived by listing the message", () => {
    const message = "first-front must lose medium levels";
    const result = run(
      [entry("good", 16, [{ message, reason: "pretend" }])],
      load,
      [],
      ["--check"],
    );
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain("trivial");
  });

  it("an out-of-band level fails unless the exact deviation is recorded", () => {
    // A real art level: tutorial-grade except it has a single kind of winning line.
    const bad = run([entry("art-crescent-moon", 1)], load, [], ["--check"]);
    expect(bad.code).toBe(1);
    expect(bad.err.join("\n")).toContain("solutions 1 outside 2..∞ for tutorial");
    const waived = run(
      [
        entry("art-crescent-moon", 1, [
          { message: "solutions 1 outside 2..∞ for tutorial", reason: "single-layer picture" },
        ]),
      ],
      load,
      [],
      ["--check"],
    );
    expect(waived.code).toBe(0);
  });

  it("a recorded deviation that no longer occurs fails, so debt cannot go stale", () => {
    const result = run(
      [
        entry("good", 1, [
          { message: "solutions 1 outside 2..∞ for tutorial", reason: "was true once" },
        ]),
      ],
      load,
      [],
      ["--check"],
    );
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain("no longer occurs");
  });

  it("level ids and numbers must be unique in the pool", () => {
    const dup = run([entry("good", 1), entry("good", 2)], load, [], ["--check"]);
    expect(dup.err.join("\n")).toContain("level id good is listed twice");
    const same = run(
      [
        entry("good", 1),
        entry("art-triple-moon", 1, [
          { message: "solutions 1 outside 2..∞ for tutorial", reason: "r" },
        ]),
      ],
      load,
      [],
      ["--check"],
    );
    expect(same.err.join("\n")).toContain("level number 1 is used twice");
  });

  it("applies the world-level repetition caps across the pool", () => {
    // Four medium-numbered copies of a level one cheap player wins: the cap is 50 % of the tier.
    const copies = [16, 17, 18, 19].map((n) => entry("good", n));
    const ids = copies.map((c, i) => ({ ...c, id: `good-${i}` }));
    const loadCopies = (id: string) => ({ ...goodLevel(), id });
    const result = reportPool(ids, loadCopies);
    expect(result.world.map((w) => w.message).join("\n")).toMatch(/wins 4 of 4 medium levels/);
    expect(result.failures.join("\n")).toContain("world:");
  });

  it("--report always writes the report, check or not", () => {
    let written = "";
    const result = run(
      [entry("unwinnable", 1)],
      load,
      [],
      ["--report"],
      (html) => (written = html),
    );
    expect(result.code).toBe(0);
    expect(written).toContain("Gate: FAIL");
  });
});

describe("loopholes the review found are closed", () => {
  it("a level that cannot lose is trivial and cannot be waived, however many messages are pasted", () => {
    // The good level has no reachable loss: at a medium number that is a missing decision, not a band detail.
    const lossless = reportLevel(entry("good", 16), goodLevel());
    const rule = lossless.issues.filter((i) => /reachable loss/.test(i.message));
    expect(rule.length).toBeGreaterThan(0);
    for (const i of rule) expect([i.kind, i.waived]).toEqual(["trivial", false]);
    const pasted = lossless.issues.map((i) => ({
      message: i.message,
      reason: "a reason that is long enough to look serious",
    }));
    const result = run([entry("good", 16, pasted)], load, [], ["--check"]);
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain("cannot be waived (trivial)");
  });

  it("waiving an unsolvable level is rejected explicitly, not silently ignored", () => {
    const r = reportLevel(
      entry("unwinnable", 1, [
        { message: "the solver proves the level cannot be won", reason: "x" },
      ]),
      unwinnable(),
    );
    expect(r.issues.map((i) => i.message).join("\n")).not.toContain("no longer occurs");
    expect(
      run(
        [
          entry("unwinnable", 1, [
            { message: "the solver proves the level cannot be won", reason: "x" },
          ]),
        ],
        load,
        [],
        ["--check"],
      ).code,
    ).toBe(1);
  });

  it("an empty pool fails, and a level that cannot be loaded is a failure, not a crash", () => {
    const empty = run([], load, [], ["--check"]);
    expect(empty.code).toBe(1);
    expect(empty.err.join("\n")).toContain("no levels to check");
    const missing = run([entry("no-such-level", 1)], load, [], ["--check"]);
    expect(missing.code).toBe(1);
    expect(missing.err.join("\n")).toContain("could not be loaded");
  });

  it("a level the engine refuses or the measures cannot read is reported as unsolvable, not thrown", () => {
    const broken = { ...goodLevel(), slots: 3 };
    // A level whose rules the validator rejects cannot be solved: the gate reports it.
    const bad = { ...broken, columns: [[{ color: 0, capacity: 1 }]] };
    const r = reportLevel(entry("good", 1), bad as collect.CollectLevel);
    expect(r.solved).toBe(false);
    expect(r.issues[0]!.kind).toBe("unsolvable");
  });

  it("applies the pool-wide curve rules: stages that do not rise are a failure", () => {
    // The same level at an easy and a tutorial number: the stage means cannot rise.
    const levelsFlat = [entry("good-a", 1), entry("good-b", 8)];
    const result = reportPool(levelsFlat, (id) => ({ ...goodLevel(), id }));
    expect(result.world.map((w) => w.message).join("\n")).toContain("must rise at least");
    expect(result.failures.join("\n")).toContain("must rise at least");
  });

  it("everything shipped must be in the pool (nothing is shipped yet)", () => {
    for (const id of SHIPPED)
      expect(POOL.map((p) => `art-${p}`).concat(POOL.map((p) => p.id))).toContain(`art-${id}`);
    expect(SHIPPED).toEqual([]);
  });
});

describe("the HTML report", () => {
  const pool = reportPool(
    [
      entry("good", 1),
      entry("art-crescent-moon", 1, [
        { message: "solutions 1 outside 2..∞ for tutorial", reason: "r" },
      ]),
    ].map((e, i) => ({ ...e, level: i + 1 })),
    load,
  );
  const html = reportHtml(pool);

  it("shows id, picture, counts, line, score components, strategy results and issues per level", () => {
    expect(html).toContain("art-crescent-moon");
    expect(html).toContain("<svg");
    expect(html).toContain("30×30");
    expect(html).toContain("312 cubes");
    expect(html).toContain("Winning line");
    expect(html).toContain("Score components");
    expect(html).toContain("first-front win");
    expect(html).toContain("known deviation");
    expect(html).toContain("Gate: PASS");
  });

  it("escapes what it prints and says FAIL with the failures when the gate fails", () => {
    const failing = reportPool([entry("unwinnable", 1)], (id) => ({
      ...load(id),
      name: "<script>x</script>",
    }));
    const out = reportHtml(failing);
    expect(out).not.toContain("<script>x</script>");
    expect(out).toContain("Gate: FAIL");
    expect(out).toContain("not solved");
  });
});

describe("the real pool", () => {
  const report = reportPool(POOL, loadPoolLevel, KNOWN_WORLD_ISSUES);

  it("passes the gate: every deviation is a recorded, reasoned known deviation", () => {
    expect(report.failures).toEqual([]);
    expect(report.levels).toHaveLength(POOL.length);
    for (const l of report.levels) {
      expect(l.solved, l.id).toBe(true);
      expect(
        l.issues.every((i) => i.waived),
        l.id,
      ).toBe(true);
    }
  });

  it("is the same set as the levels placed on the curve, at the same numbers", () => {
    const placed = {
      ...Object.fromEntries(Object.entries(PREVIEW_LEVEL).map(([id, n]) => [`art-${id}`, n])),
      ...EXTRA_LEVEL,
    };
    expect(Object.fromEntries(POOL.map((p) => [p.id, p.level]))).toEqual(placed);
  });

  it("every recorded deviation says why and what removes it", () => {
    for (const p of POOL)
      for (const k of p.knownIssues)
        expect(k.reason.length, `${p.id}: ${k.message}`).toBeGreaterThan(30);
  });
});
