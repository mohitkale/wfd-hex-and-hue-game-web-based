import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { worlds } from "@hexhue/game/levels";
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

  it("renders every shipped artwork", () => {
    for (const w of worlds) {
      for (const l of w.levels) expect(artPng(l.level, 4).length).toBeGreaterThan(100);
    }
  });

  it("makes a 1200×630 share image", () => {
    const png = PNG.sync.read(ogPng(worlds.map((w) => w.levels[0]!.level)));
    expect([png.width, png.height]).toEqual([OG_WIDTH, OG_HEIGHT]);
  });

  it("the pixel font covers the share card's text and rejects unknown glyphs", () => {
    expect(textPixels("Hex & Hue").pixels.length).toBeGreaterThan(50);
    expect(textPixels("I").width).toBe(5);
    expect(() => textPixels("?")).toThrow(/glyph/);
  });
});
