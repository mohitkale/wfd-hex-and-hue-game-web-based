import { describe, expect, it } from "vitest";
import { EMPTY } from "@hexhue/core";
import { backgroundColor } from "./background";

const _ = EMPTY;

describe("backgroundColor", () => {
  it("picks the border color even when the subject is larger (a disc on a sky)", () => {
    // 5×5: color 1 disc covers most cells, color 0 only the border corners/edges.
    const cells = [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0];
    expect(backgroundColor({ width: 5, height: 5, cells })).toBe(0);
  });

  it("ignores empty cells and falls back to the most common color", () => {
    expect(backgroundColor({ width: 3, height: 3, cells: [_, _, _, _, 2, _, _, _, _] })).toBe(2);
  });
});
