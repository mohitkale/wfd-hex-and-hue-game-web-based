import { describe, expect, it } from "vitest";
import { PICTURE_PALETTE } from "./collect/pictureBoard";
import { contrast, inkFor, luminance } from "./theme";

describe("ink on colors", () => {
  // Symbols are graphical objects: WCAG 1.4.11 asks 3:1 (every shipped color gets at least 4.3).
  it("every shipped palette color gets symbol ink with at least 3:1 contrast", () => {
    const colors = new Set(Object.values(PICTURE_PALETTE));
    for (const hex of colors) {
      const ratio = contrast(luminance(hex), luminance(inkFor(hex)));
      expect(ratio, hex).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses dark ink on mid-luminance colors where white would be weak", () => {
    expect(inkFor("#3fb8af")).toBe("#1a0f33");
    expect(inkFor("#140b2e")).toBe("#ffffff");
  });
});
