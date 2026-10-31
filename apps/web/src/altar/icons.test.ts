import { ICONS } from "@hexhue/learn";
import { describe, expect, it } from "vitest";
import { ICON_ART, iconSvg } from "./icons";

describe("altar icons", () => {
  it("draws every icon on a 12 x 12 grid with known colours", () => {
    for (const icon of ICONS) {
      const rows = ICON_ART[icon];
      expect(rows, icon).toHaveLength(12);
      for (const row of rows) expect(row, icon).toMatch(/^[.kyosdgebnfmrtachw]{12}$/);
    }
  });

  it("shows a candle's flame only when it is lit, in its wax colour", () => {
    const unlit = iconSvg("candle", 48, "#3d7be0", false);
    const lit = iconSvg("candle", 48, "#3d7be0", true);
    expect(unlit).toContain("#3d7be0");
    expect(unlit).not.toContain("#ffd84a");
    expect(lit).toContain("#ffd84a");
  });
});
