import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const testDir = new URL("packages/core/src/collect/", root);

/** `it("…")` / `test("…")` / `describe("…")` titles (also `.each(...)(`), one per match. */
function titles(source: string): string[] {
  const out: string[] = [];
  const re = /\b(?:it|test|describe)(?:\.each\([\s\S]*?\))?\(\s*(["'`])([\s\S]*?)\1/g;
  for (const m of source.matchAll(re)) out.push(m[2]!);
  return out;
}

/** The body of the test whose title contains `id`, up to the next test at the same indentation. */
function bodyAfter(source: string, id: string): string[] {
  const out: string[] = [];
  const re = new RegExp(
    `\\b(?:it|test)\\(\\s*(["'\`])[^\\n]*?${id}[^\\n]*?\\1[\\s\\S]*?\\n  \\}\\);`,
    "g",
  );
  for (const m of source.matchAll(re)) out.push(m[0]);
  return out;
}

describe("v2 rules traceability", () => {
  const files = readdirSync(testDir).filter((f) => f.endsWith(".test.ts"));
  const sources = files.map((f) => readFileSync(new URL(f, testDir), "utf8"));
  const doc = readFileSync(new URL("docs/GAME_DESIGN_V2.md", root), "utf8");

  it("every edge-case id R-01 … R-20 in GAME_DESIGN_V2.md is named in a test title", () => {
    const ids = [...new Set([...doc.matchAll(/\bR-\d\d\b/g)].map((m) => m[0]))].sort();
    expect(ids).toHaveLength(20);
    const allTitles = sources.flatMap(titles);
    const missing = ids.filter((id) => !allTitles.some((t) => t.includes(id)));
    expect(missing).toEqual([]);
  });

  it("no test named after an edge case is a stub (it must assert something real)", () => {
    const bodies = sources.flatMap((src) =>
      [...src.matchAll(/R-\d\d/g)].flatMap((m) => bodyAfter(src, m[0])),
    );
    expect(bodies.length).toBeGreaterThan(15);
    for (const body of bodies) {
      expect(body, body.slice(0, 80)).not.toMatch(/expect\(true\)\.toBe\(true\)/);
      expect(body, body.slice(0, 80)).not.toMatch(/see [a-z.]+\.test\.ts/);
      expect(body).toMatch(/expect\(/);
    }
  });

  it("every example fixture A–E of the design doc is built by the collect fixtures and used by a test", () => {
    const letters = [...doc.matchAll(/^### ([A-E])\. /gm)].map((m) => m[1]);
    expect(letters).toEqual(["A", "B", "C", "D", "E"]);
    const fixtures = readFileSync(new URL("fixtures.ts", testDir), "utf8");
    const used = sources.join("\n");
    for (const l of letters) {
      expect(fixtures).toContain(`export const fixture${l}`);
      expect(used, `fixture${l} unused`).toMatch(new RegExp(`fixture${l}\\(`));
    }
  });
});
