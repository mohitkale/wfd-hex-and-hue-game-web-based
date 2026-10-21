import { describe, expect, it } from "vitest";
import {
  EMPTY,
  countCharges,
  countFragments,
  parseLevel,
  validateLevel,
  type Level,
} from "./level";

const _ = EMPTY;

function sample(): Level {
  return {
    id: "test-1",
    name: "Test",
    width: 3,
    height: 2,
    palette: ["#aa66ff", "#ffd966"],
    cells: [0, 0, 1, _, 1, 0],
    columns: [[{ color: 0, charge: 3 }], [{ color: 1, charge: 2 }]],
    slots: 5,
    trackCap: 5,
  };
}

describe("countFragments / countCharges", () => {
  it("counts per palette color", () => {
    expect(countFragments(sample())).toEqual([3, 2]);
    expect(countCharges(sample())).toEqual([3, 2]);
  });
});

describe("validateLevel", () => {
  it("accepts a valid level", () => {
    expect(validateLevel(sample())).toEqual([]);
  });

  it("rejects charge/fragment mismatch", () => {
    const l = sample();
    l.columns[0] = [{ color: 0, charge: 2 }];
    expect(validateLevel(l)).toEqual(["color 0: wisp charges total 2 but mosaic has 3 fragments"]);
  });

  it("allows one color split across several wisps and columns", () => {
    const l = sample();
    l.columns = [
      [
        { color: 0, charge: 1 },
        { color: 1, charge: 2 },
      ],
      [{ color: 0, charge: 2 }],
    ];
    expect(validateLevel(l)).toEqual([]);
  });

  it("rejects wrong cell count", () => {
    const l = sample();
    l.cells.pop();
    expect(validateLevel(l)).toContain("cells has 5 entries, expected 6");
  });

  it("rejects out-of-palette colors in cells and wisps", () => {
    const l = sample();
    l.cells[0] = 2;
    l.columns[1] = [{ color: 5, charge: 2 }];
    const errors = validateLevel(l);
    expect(errors).toContain("cells[0] = 2 is not EMPTY or a palette index");
    expect(errors).toContain("columns[1][0].color 5 is not a palette index");
  });

  it("rejects non-positive or fractional charges", () => {
    const l = sample();
    l.columns[0] = [{ color: 0, charge: 0 }];
    l.columns[1] = [{ color: 1, charge: 1.5 }];
    expect(validateLevel(l)).toEqual([
      "columns[0][0].charge must be a positive integer",
      "columns[1][0].charge must be a positive integer",
    ]);
  });

  it("rejects bad palette, slots, track cap, empty board and empty columns", () => {
    const l = sample();
    l.palette[1] = "gold";
    l.slots = 0;
    l.trackCap = 11;
    l.cells = l.cells.map(() => EMPTY);
    l.columns.push([]);
    const errors = validateLevel(l);
    expect(errors).toEqual(
      expect.arrayContaining([
        'palette[1] "gold" is not #rrggbb',
        "slots must be 1..8",
        "trackCap must be 1..10",
        "mosaic has no fragments",
        "columns[2] is empty",
      ]),
    );
  });
});

describe("parseLevel", () => {
  it("round-trips through JSON", () => {
    const l = sample();
    expect(parseLevel(JSON.parse(JSON.stringify(l)))).toEqual(l);
  });

  it("drops unknown fields", () => {
    const parsed = parseLevel({ ...sample(), extra: true });
    expect(parsed).not.toHaveProperty("extra");
  });

  it("throws on wrong shapes", () => {
    expect(() => parseLevel(null)).toThrow("not an object");
    expect(() => parseLevel({ ...sample(), width: "3" })).toThrow("width must be a number");
    expect(() => parseLevel({ ...sample(), columns: [[{ color: 0 }]] })).toThrow(
      "columns[0][0] must be {color, charge}",
    );
  });

  it("throws on rule violations", () => {
    const l = sample();
    l.columns[0] = [{ color: 0, charge: 9 }];
    expect(() => parseLevel(l)).toThrow("wisp charges total 9");
  });
});
