import { describe, expect, it } from "vitest";
import { sliderGesture, sliderValue } from "./slider";

describe("sliderValue", () => {
  it("maps the track to 0..1 and clamps past either end", () => {
    expect(sliderValue(150, 100, 200)).toBe(0.25);
    expect(sliderValue(50, 100, 200)).toBe(0);
    expect(sliderValue(400, 100, 200)).toBe(1);
    expect(sliderValue(100, 100, 0)).toBe(0);
  });
});

describe("sliderGesture", () => {
  it("only a mostly horizontal move drags; a vertical one scrolls the page", () => {
    expect(sliderGesture(3, 2, 8)).toBe("pending");
    expect(sliderGesture(12, 4, 8)).toBe("drag");
    expect(sliderGesture(-12, 4, 8)).toBe("drag");
    expect(sliderGesture(4, 12, 8)).toBe("scroll");
    expect(sliderGesture(9, -10, 8)).toBe("scroll");
  });
});
