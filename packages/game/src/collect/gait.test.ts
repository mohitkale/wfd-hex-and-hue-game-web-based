import { describe, expect, it } from "vitest";
import { SPECIES } from "./familiarArt";
import { gait, GAIT_MS, headingOf, STRIDE_CSS, strideCycle, strideFrame, turnToward } from "./gait";
import { COMBO_WINDOW_MS, comboAfter, NO_COMBO } from "./combo";

/** The gait sampled over one stride while moving. */
const sample = (species: (typeof SPECIES)[number]) =>
  Array.from({ length: 48 }, (_, i) => gait(species, true, i / 48, 0));

describe("every familiar moves its own way (M15.13)", () => {
  it("gives each species a different movement", () => {
    const shapes = SPECIES.map((sp) =>
      sample(sp)
        .map((g) => `${g.dy.toFixed(2)}:${g.rot.toFixed(2)}:${g.sx.toFixed(2)}`)
        .join(","),
    );
    expect(new Set(shapes).size).toBe(SPECIES.length);
  });

  it("the frog hops highest and squashes on landing; the bat rises on its wingbeat", () => {
    const frog = sample("frog");
    const highest = (sp: (typeof SPECIES)[number]) => Math.min(...sample(sp).map((g) => g.dy));
    for (const sp of SPECIES) if (sp !== "frog") expect(highest("frog")).toBeLessThan(highest(sp));
    expect(Math.max(...frog.map((g) => g.sx))).toBeGreaterThan(1.1);
    const bat = sample("bat").map((g) => g.dy);
    expect(Math.min(...bat)).toBeLessThan(0);
    expect(Math.max(...bat)).toBeGreaterThan(0);
  });

  it("the owl and spider tilt, and standing still is calmer than moving", () => {
    for (const sp of ["owl", "spider"] as const)
      expect(Math.max(...sample(sp).map((g) => Math.abs(g.rot)))).toBeGreaterThan(0.08);
    for (const sp of SPECIES) {
      const still = Array.from({ length: 48 }, (_, i) =>
        Math.abs(gait(sp, false, 0, (i / 48) * GAIT_MS[sp]).dy),
      );
      expect(Math.max(...still)).toBeLessThanOrEqual(
        Math.max(...sample(sp).map((g) => Math.abs(g.dy))),
      );
    }
  });

  it("the stride follows the distance walked, so feet do not slide, and the ant steps quickest", () => {
    for (const sp of SPECIES) {
      expect(strideCycle(sp, 0, 0.25)).toBeCloseTo(0.25);
      expect(strideCycle(sp, STRIDE_CSS[sp], 0.25)).toBeCloseTo(0.25);
      expect(strideCycle(sp, STRIDE_CSS[sp] / 2, 0)).toBeCloseTo(0.5);
      expect(STRIDE_CSS.ant).toBeLessThanOrEqual(STRIDE_CSS[sp]);
    }
    // Every frame of the cycle is shown, in order, over one stride.
    const frames = Array.from({ length: 60 }, (_, i) => strideFrame(i / 60, 6));
    expect([...new Set(frames)]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(strideFrame(0.9999, 6)).toBe(5);
  });
});

describe("facing the way it goes (M15.13)", () => {
  it("points the head up, right, down and left as it moves that way", () => {
    expect(headingOf(0, -1)).toBeCloseTo(0);
    expect(headingOf(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(headingOf(0, 1))).toBeCloseTo(Math.PI);
    expect(headingOf(-1, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it("turns the shorter way round, and only as far as asked", () => {
    expect(turnToward(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4);
    // From just left of down to just right of down: through down, not all the way round.
    const a = turnToward(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.cos(a)).toBeCloseTo(-1, 2);
    expect(turnToward(1, 2, 1)).toBeCloseTo(2);
    expect(turnToward(1, 2, 0)).toBeCloseTo(1);
  });
});

describe("combos", () => {
  it("praise boxes finished one soon after another, and start over after a pause", () => {
    let c = comboAfter(NO_COMBO, 1000);
    expect(c.word).toBeNull();
    c = comboAfter(c.combo, 2500);
    expect(c.word).toBe("Nice!");
    c = comboAfter(c.combo, 4000);
    expect(c.word).toBe("Great!");
    c = comboAfter(c.combo, 4100);
    c = comboAfter(c.combo, 4200);
    c = comboAfter(c.combo, 4300);
    expect(c.word).toBe("Spellbinding!");
    c = comboAfter(c.combo, 4300 + COMBO_WINDOW_MS + 1);
    expect(c.word).toBeNull();
    expect(c.combo.count).toBe(1);
  });
});
