import { describe, expect, it } from "vitest";
import { keyToSource } from "./keys";

describe("keyToSource", () => {
  it("maps digit and numpad keys to columns within range", () => {
    expect(keyToSource("Digit1", 3, 5)).toEqual({ kind: "column", index: 0 });
    expect(keyToSource("Numpad3", 3, 5)).toEqual({ kind: "column", index: 2 });
    expect(keyToSource("Digit4", 3, 5)).toBeNull();
    expect(keyToSource("Digit0", 3, 5)).toBeNull();
  });

  it("maps the top letter row to slots by position (layout-independent)", () => {
    expect(keyToSource("KeyQ", 3, 5)).toEqual({ kind: "slot", index: 0 });
    expect(keyToSource("KeyT", 3, 5)).toEqual({ kind: "slot", index: 4 });
    expect(keyToSource("KeyY", 3, 5)).toBeNull();
  });

  it("ignores everything else", () => {
    for (const code of ["Enter", "Space", "KeyA", "Digit10", "ArrowUp", "1", "q", "01", "1.5"]) {
      expect(keyToSource(code, 6, 8)).toBeNull();
    }
  });
});
