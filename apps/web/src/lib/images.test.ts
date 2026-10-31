import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { CHAPTERS } from "@hexhue/game/journey";
import { gallery, journeyPictures } from "./site";
import { OG_HEIGHT, OG_WIDTH, artPng, ogPng } from "./images";
import { textPixels } from "./pixelFont";

describe("site images", () => {
  it("renders an artwork at the requested tile size, transparent where empty", () => {
    const art = { width: 2, height: 1, palette: ["#ff0000"], cells: [0, -1] };
    const png = PNG.sync.read(artPng(art, 10));
    expect([png.width, png.height]).toEqual([20, 10]);
    const at = (x: number, y: number) =>
      Array.from(png.data.subarray((y * 20 + x) * 4, (y * 20 + x) * 4 + 4));
    expect(at(5, 5)).toEqual([255, 0, 0, 255]);
    expect(at(15, 5)[3]).toBe(0);
  });

  it("renders every journey picture, and the gallery lists all 24 by chapter", () => {
    const all = journeyPictures();
    expect(all).toHaveLength(24);
    for (const p of all) expect(artPng(p.art, 4).length).toBeGreaterThan(100);
    expect(gallery().map((c) => c.items.length)).toEqual(CHAPTERS.map(() => 4));
  });

  it("makes a 1200×630 share image, titled with any chapter's name", () => {
    const finales = journeyPictures().filter((p) => p.entry.tier === "extreme");
    const png = PNG.sync.read(ogPng(finales.slice(0, 4).map((p) => p.art)));
    expect([png.width, png.height]).toEqual([OG_WIDTH, OG_HEIGHT]);
    for (const name of CHAPTERS) expect(() => ogPng([finales[0]!.art], name)).not.toThrow();
  });

  it("the pixel font covers the share card's text and rejects unknown glyphs", () => {
    expect(textPixels("Hex & Hue").pixels.length).toBeGreaterThan(50);
    expect(textPixels("I").width).toBe(5);
    expect(() => textPixels("?")).toThrow(/glyph/);
  });
});
