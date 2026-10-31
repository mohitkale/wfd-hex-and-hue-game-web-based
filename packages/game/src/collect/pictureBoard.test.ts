import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { ART_LEVELS } from "./artLevels";
import { JOURNEY } from "./journey";
import { moonlitHat } from "./slice";
import { nearestColour, PICTURE_PALETTE, toPictureBoard } from "./pictureBoard";

const P = PICTURE_PALETTE;
const boards = [moonlitHat(), ...Object.values(ART_LEVELS).map((m) => m())].map((l) =>
  toPictureBoard(l),
);

describe("picture boards (M15.13)", () => {
  it("use only the fixed palette; only a picture that covers its canvas fills the board", () => {
    const allowed = new Set<string>(Object.values(P));
    for (const b of boards) {
      for (const c of b.palette) expect(allowed.has(c), b.id).toBe(true);
      expect(collect.validateCollectLevel(b), b.id).toEqual([]);
    }
    // The slice's art has its own background: all of it is cubes, and the margin round it is not
    // filled (no filler cubes, owner feedback).
    const hat = toPictureBoard(moonlitHat());
    const art = moonlitHat();
    expect(hat.cells.filter((c) => c >= 0).length).toBe(4 * art.width * art.height);
    // The crescent moon covers a third of its canvas: no filler cubes round it.
    const moon = toPictureBoard(ART_LEVELS["art-crescent-moon"]!());
    expect(moon.cells.filter((c) => c < 0).length).toBeGreaterThan(moon.cells.length / 2);
  });

  it("a cube's colour is its box's colour: one shade per colour, the same hex", () => {
    for (const b of boards) {
      expect(b.shades!.colors, b.id).toEqual(b.palette);
      expect(b.shades!.cells, b.id).toEqual(b.cells);
    }
  });

  it("boxes are at most 80, like the reference's", () => {
    for (const b of boards) {
      for (const col of b.columns) for (const g of col) expect(g.capacity).toBeLessThanOrEqual(80);
    }
  });

  it("boards are about twice as dense: the picture centred in a frame up to 40 cubes; light, mid and dark colours", () => {
    const hat = toPictureBoard(moonlitHat());
    expect(hat.width).toBeGreaterThanOrEqual(moonlitHat().width * 2);
    for (const b of boards) {
      expect(b.width, b.id).toBeLessThanOrEqual(40);
      expect(b.width * b.height, b.id).toBeGreaterThanOrEqual(900);
    }
    const amethyst = toPictureBoard(ART_LEVELS["art-amethyst-cluster"]!());
    const purples = [P.lightPurple, P.purple, P.darkPurple].filter((c) =>
      amethyst.palette.includes(c),
    );
    expect(purples.length).toBeGreaterThanOrEqual(2);
  });

  it("names colours the way a person would", () => {
    expect(nearestColour("#5d5680")).toBe(P.grey); // a slate (the grey is darker since M15.13)
    expect(nearestColour("#33303f")).toBe(P.black);
    expect(nearestColour("#f6c945")).toBe(P.yellow); // moon gold
    expect(nearestColour("#5cbf5a")).toBe(P.lightGreen);
    expect(nearestColour("#1f5e2a")).toBe(P.darkGreen);
    expect(nearestColour("#e24a4a")).toBe(P.red);
    expect(nearestColour("#9c5a2a")).toBe(P.brown);
    expect(nearestColour("#ffffff")).toBe(P.white);
    expect(nearestColour("#8a5ad8")).toBe(P.purple);
    expect(nearestColour("#f27ac0")).toBe(P.pink);
  });

  it("a filled board has a scene behind the picture (sky above, ground below) and no doubled outline", () => {
    const hat = toPictureBoard(moonlitHat());
    expect(hat.palette.length).toBeGreaterThan(3);
    // An open board has no added outline: the empty cell beside the moon's edge stays empty.
    const moon = toPictureBoard(ART_LEVELS["art-crescent-moon"]!());
    const art = moon.cells.findIndex((c) => c >= 0);
    expect(moon.cells[art - 1]).toBe(-1);
  });

  it("keep every palette colour as it is, so drawn pictures play in the colours they were drawn in", () => {
    for (const c of Object.values(P)) expect(nearestColour(c)).toBe(c);
  });

  it("plays every journey picture exactly as drawn: valid, edge to edge, in the palette, named after its picture", () => {
    const allowed = new Set<string>(Object.values(P));
    for (const e of JOURNEY) {
      const level = e.make();
      expect(level.id).toBe(`j-${level.subject!.id}`);
      expect(collect.validateCollectLevel(level), e.id).toEqual([]);
      for (const c of level.palette) expect(allowed.has(c), e.id).toBe(true);
      // No scene was added round it: every colour is one the picture was drawn in.
      expect(level.shades!.colors).toEqual(level.palette);
    }
  });
});
