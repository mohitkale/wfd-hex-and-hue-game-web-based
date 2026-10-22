import { describe, expect, it } from "vitest";
import {
  COMBO_EVERY,
  COMBO_GAP_STEPS,
  ComboTracker,
  confettiColors,
  isComboMilestone,
} from "./juice";
import { theme } from "./theme";

describe("combo tracker", () => {
  it("chains collections at most COMBO_GAP_STEPS apart", () => {
    const combo = new ComboTracker();
    expect(combo.hit(10)).toBe(1);
    expect(combo.hit(11)).toBe(2);
    expect(combo.hit(11)).toBe(3); // two wisps collecting in the same step
    expect(combo.hit(11 + COMBO_GAP_STEPS)).toBe(4);
  });

  it("breaks the chain after a longer gap, and on reset", () => {
    const combo = new ComboTracker();
    combo.hit(1);
    combo.hit(2);
    expect(combo.hit(3 + COMBO_GAP_STEPS)).toBe(1);
    combo.hit(4 + COMBO_GAP_STEPS);
    combo.reset();
    expect(combo.hit(5 + COMBO_GAP_STEPS)).toBe(1);
  });

  it("celebrates every COMBO_EVERY collections in a chain", () => {
    const hits = Array.from({ length: 4 * COMBO_EVERY + 1 }, (_, i) => i).filter(isComboMilestone);
    expect(hits).toEqual([COMBO_EVERY, 2 * COMBO_EVERY, 3 * COMBO_EVERY, 4 * COMBO_EVERY]);
  });
});

describe("confetti colors", () => {
  it("uses the palette plus gold, without duplicates or colors lost on the night sky", () => {
    const colors = confettiColors(["#ff8fa3", "#ff8fa3", "#05030a", "#f6d97a", "#7fd4ff"]);
    expect(colors).toEqual([0xff8fa3, 0xf6d97a, 0x7fd4ff]);
    expect(colors).toContain(theme.glow);
  });
});
