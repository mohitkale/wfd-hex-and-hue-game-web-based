import { describe, expect, it } from "vitest";
import { calendarDate, daysUntil, moonPath, readHemisphere, whenText } from "./skyView";

describe("the moon drawing", () => {
  it("lights the right side while waxing and the left while waning", () => {
    expect(moonPath(45, 50)).toContain("A50,50 0 0 1 50,100");
    expect(moonPath(225, 50)).toContain("A50,50 0 0 0 50,100");
  });

  it("bulges the terminator the right way for crescents and gibbous moons", () => {
    expect(moonPath(45, 50)).toMatch(/A35\.36,50 0 0 0 50,0 Z$/); // waxing crescent
    expect(moonPath(135, 50)).toMatch(/A35\.36,50 0 0 1 50,0 Z$/); // waxing gibbous
    expect(moonPath(225, 50)).toMatch(/0 0 0 50,0 Z$/); // waning gibbous
    expect(moonPath(315, 50)).toMatch(/0 0 1 50,0 Z$/); // waning crescent
  });

  it("is a half disc at the quarters", () => {
    expect(moonPath(90, 50)).toContain("A0.00,50");
  });
});

describe("days and words", () => {
  it("counts calendar days", () => {
    const now = new Date(2026, 10, 1, 23, 30);
    expect(daysUntil(now, new Date(2026, 10, 2, 0, 10))).toBe(1);
    expect(daysUntil(now, new Date(2026, 11, 21, 12))).toBe(50);
    expect(whenText(now, new Date(2026, 10, 1, 23, 50))).toBe("today");
    expect(whenText(now, new Date(2026, 10, 2, 9))).toBe("tomorrow");
    expect(whenText(now, new Date(2026, 10, 5))).toBe("in 4 days");
  });

  it("keeps a festival's calendar date in any time zone", () => {
    const imbolc = calendarDate(Date.UTC(2027, 1, 1));
    expect([imbolc.getFullYear(), imbolc.getMonth(), imbolc.getDate()]).toEqual([2027, 1, 1]);
  });

  it("reads the stored hemisphere, north by default", () => {
    expect(readHemisphere({ getItem: () => "south" })).toBe("south");
    expect(readHemisphere({ getItem: () => "x" })).toBe("north");
    expect(readHemisphere(null)).toBe("north");
    expect(
      readHemisphere({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe("north");
  });
});
