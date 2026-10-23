import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);

describe("v2 rules traceability", () => {
  it("every edge-case id R-01 … R-20 in GAME_DESIGN_V2.md appears in the collect tests", () => {
    const doc = readFileSync(new URL("docs/GAME_DESIGN_V2.md", root), "utf8");
    const ids = [...new Set([...doc.matchAll(/\bR-\d\d\b/g)].map((m) => m[0]))].sort();
    expect(ids).toHaveLength(20);
    const dir = new URL("packages/core/src/collect/", root);
    const tests = readdirSync(dir)
      .filter((f) => f.endsWith(".test.ts"))
      .map((f) => readFileSync(new URL(f, dir), "utf8"))
      .join("\n");
    const missing = ids.filter((id) => !tests.includes(id));
    expect(missing).toEqual([]);
  });

  it("every example fixture A–E of the design doc is built by the collect fixtures", () => {
    const doc = readFileSync(new URL("docs/GAME_DESIGN_V2.md", root), "utf8");
    const letters = [...doc.matchAll(/^### ([A-E])\. /gm)].map((m) => m[1]);
    expect(letters).toEqual(["A", "B", "C", "D", "E"]);
    const fixtures = readFileSync(new URL("packages/core/src/collect/fixtures.ts", root), "utf8");
    for (const l of letters) expect(fixtures).toContain(`fixture${l}`);
  });
});
