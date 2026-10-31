import { describe, expect, it } from "vitest";
import { Canvas, asLevel, textWidth } from "./pixelCanvas";
import { contrastIssues, deltaE, MIN_PALETTE_DELTA_E, PICTURE_PALETTE as P } from "./pictureBoard";

describe("the picture palette and contrast (M15.13)", () => {
  it("every two palette colours are clearly different", () => {
    const colours = Object.values(P);
    for (let i = 0; i < colours.length; i++)
      for (let j = i + 1; j < colours.length; j++)
        expect(
          deltaE(colours[i]!, colours[j]!),
          `${colours[i]} ${colours[j]}`,
        ).toBeGreaterThanOrEqual(MIN_PALETTE_DELTA_E);
  });

  it("flags neighbouring colours that blur together, and not ones apart", () => {
    const g = new Canvas(4, 1);
    g.set(0, 0, "#ff0000");
    g.set(1, 0, "#fe0505");
    g.set(3, 0, "#fe0505");
    expect(
      contrastIssues(asLevel("x", g, { id: "x", name: "X", theme: "other", lore: "x" })).length,
    ).toBe(1);
    const h = new Canvas(3, 1);
    h.set(0, 0, P.yellow);
    h.set(1, 0, P.black);
    expect(
      contrastIssues(asLevel("y", h, { id: "y", name: "Y", theme: "other", lore: "y" })),
    ).toEqual([]);
  });
});

describe("the drawing canvas (M15.13)", () => {
  it("outlines a shape in one cell of black, outside and between colours", () => {
    const g = new Canvas(7, 5);
    g.rect(2, 1, 4, 3, P.yellow);
    g.set(4, 2, P.red);
    g.outline(P.black);
    // The silhouette grew by a cell all round (corners are left open, like hand-drawn pixel art).
    expect(g.get(1, 2)).toBe(P.black);
    expect(g.get(5, 2)).toBe(P.black);
    expect(g.get(3, 0)).toBe(P.black);
    expect(g.get(1, 0)).toBeNull();
    // Where yellow meets red, one side became the line: never both.
    const line = [g.get(3, 2), g.get(4, 2)];
    expect(line.filter((c) => c === P.black).length).toBe(1);
  });

  it("keeps the colours it is told to keep", () => {
    const g = new Canvas(5, 3);
    g.rect(0, 0, 4, 2, P.white);
    g.set(2, 1, P.black);
    g.set(1, 1, P.red);
    g.outline(P.black, { keep: [P.red], outside: false });
    expect(g.get(1, 1)).toBe(P.red);
  });

  it("writes words in a 3×5 pixel font", () => {
    const g = new Canvas(20, 5);
    const w = g.text(0, 0, "BE", P.black);
    expect(w).toBe(7);
    // Nine letters of 3, a space of 2 and a cell between each of the ten characters.
    expect(textWidth("BLESSED BE")).toBe(9 * 3 + 2 + 9);
    expect(g.cells.filter((c) => c === P.black).length).toBeGreaterThan(15);
    // Unknown characters are spaces, never a crash.
    expect(() => g.text(0, 0, "@#", P.black)).not.toThrow();
  });

  it("draws at any scale: shapes keep their place, outlines stay one cube thick", () => {
    const draw = () => {
      const g = new Canvas(10, 10);
      g.disc(5, 5, 3, P.red);
      g.dot(0, 0, P.yellow);
      g.outline(P.black);
      return g;
    };
    const one = draw();
    const big = Canvas.render(1.5, draw);
    expect([big.w, big.h]).toEqual([15, 15]);
    // About 1.5² times the disc, and the design cell (0, 0) covers the cubes whose centres lie in it.
    const red = (g: Canvas) => g.cells.filter((c) => c === P.red).length;
    expect(red(big) / red(one)).toBeGreaterThan(1.8);
    expect(big.get(0, 0)).toBe(P.yellow);
    expect(big.get(1, 1)).not.toBe(P.yellow);
    // Outside `render` the scale is back to 1.
    expect(new Canvas(4, 4).w).toBe(4);
    // A one-cube outline: no black cube has black on both its left and right along the disc's row.
    const row = 7;
    const blacks = [...Array(big.w).keys()].filter((x) => big.get(x, row) === P.black);
    expect(blacks.every((x) => !(blacks.includes(x - 1) && blacks.includes(x + 1)))).toBe(true);
  });
});
