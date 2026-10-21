import { describe, expect, it } from "vitest";
import { keyToSource } from "./keys";

describe("keyToSource", () => {
  it("maps number keys to columns within range", () => {
    expect(keyToSource("1", 3, 5)).toEqual({ kind: "column", index: 0 });
    expect(keyToSource("3", 3, 5)).toEqual({ kind: "column", index: 2 });
    expect(keyToSource("4", 3, 5)).toBeNull();
    expect(keyToSource("0", 3, 5)).toBeNull();
  });

  it("maps the top letter row to slots, case-insensitively", () => {
    expect(keyToSource("q", 3, 5)).toEqual({ kind: "slot", index: 0 });
    expect(keyToSource("T", 3, 5)).toEqual({ kind: "slot", index: 4 });
    expect(keyToSource("y", 3, 5)).toBeNull();
  });

  it("ignores everything else", () => {
    for (const key of ["Enter", " ", "a", "10", "ArrowUp"])
      expect(keyToSource(key, 6, 8)).toBeNull();
  });
});
