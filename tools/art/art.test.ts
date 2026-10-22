import { describe, expect, it } from "vitest";
import { EMPTY, createRng, parseAsciiArt } from "@hexhue/core";
import { theme } from "../../packages/game/src/theme";
import { PANEL, artProblems } from "./check";
import { contrast, distance, parseHex } from "./color";
import { MAX_IMPORT_COLORS, detectBlock, quantize, toAsciiSource } from "./quantize";

/** Builds an RGBA buffer from rows of single-char color keys, each scaled to `block` px. */
function image(rows: string[], colors: Record<string, number[]>, block = 1) {
  const w = rows[0]!.length * block;
  const h = rows.length * block;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[Math.floor(y / block)]![Math.floor(x / block)]!;
      rgba.set(colors[ch] ?? [0, 0, 0, 0], (y * w + x) * 4);
    }
  }
  return { rgba, w, h };
}

const C = { r: [220, 40, 60, 255], g: [40, 200, 90, 255], R: [215, 45, 65, 255] };

describe("color", () => {
  it("measures contrast and distance", () => {
    expect(contrast([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 0);
    expect(distance(parseHex("#ff0000"), parseHex("#ff0000"))).toBe(0);
    expect(distance(parseHex("#ff0000"), parseHex("#00ff00"))).toBeGreaterThan(300);
  });
});

describe("detectBlock / quantize", () => {
  it("detects upscaled pixel art and samples one pixel per cell", () => {
    const { rgba, w, h } = image(["rg.", "gr."], C, 4);
    expect(detectBlock(rgba, w, h)).toBe(4);
    const art = quantize(rgba, w, h);
    expect(art.width).toBe(3);
    expect(art.height).toBe(2);
    expect(art.cells[2]).toBe(EMPTY);
    expect(art.palette).toHaveLength(2);
  });

  it("merges near-identical colors down to maxColors, keeping distinct ones", () => {
    const { rgba, w, h } = image(["rrRg", "rRgg"], C);
    expect(quantize(rgba, w, h).palette).toHaveLength(3);
    const merged = quantize(rgba, w, h, { maxColors: 2 });
    expect(merged.palette).toHaveLength(2);
    // The two reds became one; green survives.
    expect(merged.cells[0]).toBe(merged.cells[2]);
    expect(merged.cells[0]).not.toBe(merged.cells[3]);
  });

  it("ignores a partial margin at the right/bottom edge when detecting the block", () => {
    const { rgba, w, h } = image(["rg", "gr"], C, 8);
    // Add a 2 px transparent margin on the right.
    const W = w + 2;
    const padded = new Uint8Array(W * h * 4);
    for (let y = 0; y < h; y++) padded.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * W * 4);
    expect(detectBlock(padded, W, h)).toBe(8);
  });

  it("treats all fully transparent pixels as identical", () => {
    const { rgba, w, h } = image(["r.", ".r"], C, 4);
    // Junk RGB under transparency, different per pixel.
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] === 0) rgba[i] = i % 251;
    expect(detectBlock(rgba, w, h)).toBe(4);
  });

  it("rejects impossible options and photo-like input", () => {
    const { rgba, w, h } = image(["rg", "gr"], C, 2);
    expect(() => quantize(rgba, w, h, { maxColors: 0 })).toThrow("maxColors");
    expect(() => quantize(rgba, w, h, { maxColors: MAX_IMPORT_COLORS + 1 })).toThrow("maxColors");
    expect(() => quantize(rgba, w, h, { block: 9 })).toThrow("does not fit");
    // 48×48 of noise: thousands of colors, bucketed, still far too many to be pixel art.
    const rng = createRng(1);
    const noise = new Uint8Array(48 * 48 * 4).map((_, i) => (i % 4 === 3 ? 255 : rng.int(0, 255)));
    const started = performance.now();
    expect(() => quantize(noise, 48, 48, { block: 1 })).toThrow("photo");
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("can reduce to a single color", () => {
    const { rgba, w, h } = image(["rgR"], C);
    expect(quantize(rgba, w, h, { maxColors: 1 }).palette).toHaveLength(1);
  });

  it("round-trips through the ASCII source format", () => {
    const { rgba, w, h } = image(["rg.", ".gr"], C, 2);
    const art = quantize(rgba, w, h);
    const src = toAsciiSource("demo", art);
    const legend = Object.fromEntries(
      [...src.matchAll(/(\w): "(#[0-9a-f]{6})"/g)].map((m) => [m[1], m[2]]),
    );
    const rows = [...src.matchAll(/^ {4}"([^"]+)",$/gm)].map((m) => m[1]!);
    expect(parseAsciiArt({ legend, rows })).toEqual(art);
  });
});

describe("artProblems", () => {
  it("measures against the game's real board panel color", () => {
    expect((PANEL[0] << 16) | (PANEL[1] << 8) | PANEL[2]).toBe(theme.panel);
  });

  it("flags colors too dark for the board and pairs too similar to tell apart", () => {
    expect(artProblems({ palette: ["#f6d97a", "#4b3c9e"] })).toEqual([]);
    expect(artProblems({ palette: ["#140c30"] })[0]).toMatch("too dark");
    expect(artProblems({ palette: ["#f6d97a", "#f2d47e"] })[0]).toMatch("too similar");
  });
});
