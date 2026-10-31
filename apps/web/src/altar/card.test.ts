import { describe, expect, it } from "vitest";
import { shortStep, wrapText } from "./card";

describe("ritual card text", () => {
  it("wraps words to a width", () => {
    const measure = (s: string) => s.length;
    expect(wrapText(measure, "one two three four", 9)).toEqual(["one two", "three", "four"]);
    expect(wrapText(measure, "", 9)).toEqual([]);
  });

  it("keeps a step's first sentence", () => {
    expect(shortStep("Light the candle.")).toBe("Light the candle");
    expect(shortStep("Dress the candle with oil: stroke up, then down.")).toBe(
      "Dress the candle with oil",
    );
    expect(shortStep("Which colour? Pick one.")).toBe("Which colour?");
  });
});
