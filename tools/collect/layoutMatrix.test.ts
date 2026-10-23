import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { table } from "./layoutMatrix";

/** The device table in docs/V2_INTERFACE.md is what `npm run layout:matrix` prints (M14.1). */
const squash = (s: string) =>
  s
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\| ?/g, "|")
    .replace(/-+/g, "-");

describe("docs/V2_INTERFACE.md", () => {
  it("contains the device table the tool prints (alignment aside)", () => {
    const doc = readFileSync(new URL("../../docs/V2_INTERFACE.md", import.meta.url), "utf8");
    expect(squash(doc)).toContain(squash(table()));
  });
});
