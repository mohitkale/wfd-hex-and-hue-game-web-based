import { describe, expect, it } from "vitest";
import { sliderValue } from "./slider";

describe("sliderValue", () => {
  it("maps the track to 0..1 and clamps past either end", () => {
    expect(sliderValue(150, 100, 200)).toBe(0.25);
    expect(sliderValue(50, 100, 200)).toBe(0);
    expect(sliderValue(400, 100, 200)).toBe(1);
    expect(sliderValue(100, 100, 0)).toBe(0);
  });
});
