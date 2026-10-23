import { describe, expect, it } from "vitest";
import { createRng } from "@hexhue/core";
import { pieces, SHIPPED } from "../../content/v2art";
import { checkLibrary, formatReport } from "./artcheck";
import { candle, crescent } from "./fixtures";
import { importFamilies, toPieceSource } from "./importFamilies";
import { parsePiece, type ArtPiece } from "./piece";
import { checkPiece } from "./rules";
import { renderPng, sheetHtml } from "./sheet";

describe("art:check over the library", () => {
  it("the real library passes (and nothing is shipped before gate G2)", () => {
    const report = checkLibrary(pieces, SHIPPED);
    expect(formatReport(report)).not.toContain("✗");
    expect(report.ok).toBe(true);
    expect(SHIPPED).toEqual([]);
  });

  it("fails on duplicate ids, shipped ids that do not exist and unreviewed shipped art", () => {
    expect(checkLibrary([candle, candle]).problems).toEqual(['duplicate piece id "worked-candle"']);
    expect(checkLibrary([candle], ["nope"]).problems).toEqual([
      'shipped piece "nope" does not exist',
    ]);
    const shipped = checkLibrary([candle], ["worked-candle"]);
    expect(shipped.ok).toBe(false);
    expect(formatReport(shipped)).toContain("PR-reviewed");
    expect(checkLibrary([candle, crescent]).ok).toBe(true);
  });

  it("fails on low-quality art and says which rule and what was measured", () => {
    const bad: ArtPiece = {
      ...candle,
      id: "bad",
      rows: candle.rows.map((r) => r.replace(/[hmsd]/g, "Y")),
    };
    const report = checkLibrary([bad]);
    expect(report.ok).toBe(false);
    expect(formatReport(report)).toMatch(/✗ A-\d\d: /);
  });

  it("prints every rule with --all and names the empty library", () => {
    expect(formatReport(checkLibrary([]))).toBe("no v2 art pieces yet (content/v2art)");
    expect(formatReport(checkLibrary([candle]), true)).toContain("· A-20: mask IoU 0.88");
  });
});

describe("importing production art (snap to the house families)", () => {
  /** The piece as an upscaled PNG (4 px per cube, no gaps), as an artist would export it. */
  const asImage = (piece: ArtPiece) => {
    const png = renderPng(piece, 4, false);
    return { rgba: new Uint8Array(png.data), w: png.width, h: png.height };
  };

  it("recovers a house-palette picture exactly: same families, same shades, same cells", () => {
    const { rgba, w, h } = asImage(candle);
    const result = importFamilies(rgba, w, h);
    expect(result.error).toEqual({ mean: 0, max: 0 });
    expect([result.width, result.height]).toEqual([16, 20]);
    const original = parsePiece(candle).cells;
    const imported = parsePiece({ ...candle, rows: result.rows, legend: result.legend }).cells;
    imported.forEach((cell, i) => {
      expect(cell?.family).toBe(original[i]?.family);
      expect(cell?.role).toBe(original[i]?.role);
    });
    expect(checkPiece({ ...candle, rows: result.rows, legend: result.legend }).errors).toEqual([]);
  });

  it("snaps slightly-off colours to the nearest house shade and reports the error", () => {
    const { rgba, w, h } = asImage(candle);
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3]) rgba[i] = Math.min(255, rgba[i]! + 6);
    const result = importFamilies(rgba, w, h);
    expect(result.error.mean).toBeGreaterThan(0);
    expect(result.error.max).toBeLessThan(45);
    expect(result.mapping[0]!.pixels).toBeGreaterThanOrEqual(result.mapping.at(-1)!.pixels);
  });

  it("rejects an image too far from the palette (quality control)", () => {
    const rgba = new Uint8Array(16 * 4 * 4).fill(0);
    for (let i = 0; i < 16; i++) rgba.set(i % 2 ? [0, 255, 0, 255] : [255, 0, 255, 255], i * 4);
    expect(() => importFamilies(rgba, 4, 4, { block: 1 })).toThrow(
      "too far from the house palette",
    );
    expect(() => importFamilies(rgba, 4, 4, { block: 1, maxMeanError: 400 })).not.toThrow();
  });

  it("folds the least-used families into the nearest kept ones", () => {
    const { rgba, w, h } = asImage(crescent);
    const result = importFamilies(rgba, w, h, { maxFamilies: 2, maxMeanError: 400 });
    const families = new Set(Object.values(result.legend).map(([f]) => f));
    expect(families.size).toBe(2);
    expect(result.error.mean).toBeGreaterThan(0);
  });

  it("rejects impossible options, empty images and photographs", () => {
    const { rgba, w, h } = asImage(candle);
    expect(() => importFamilies(rgba, w, h, { maxFamilies: 0 })).toThrow("maxFamilies");
    expect(() => importFamilies(rgba, w, h, { maxFamilies: 9 })).toThrow("maxFamilies");
    expect(() => importFamilies(rgba, w, h, { block: 999 })).toThrow("does not fit");
    expect(() => importFamilies(new Uint8Array(16), 2, 2, { block: 1 })).toThrow("no filled cells");
    const rng = createRng(3);
    const noise = new Uint8Array(40 * 40 * 4).map((_, i) => (i % 4 === 3 ? 255 : rng.int(0, 255)));
    expect(() => importFamilies(noise, 40, 40, { block: 1 })).toThrow("photo");
  });

  it("writes unreviewed, imported, licence-pending source that cannot ship as is", () => {
    const { rgba, w, h } = asImage(candle);
    const src = toPieceSource("my-candle", importFamilies(rgba, w, h), "Alex");
    expect(src).toContain('id: "my-candle"');
    expect(src).toContain('source: "imported-png"');
    expect(src).toContain("reviewed: false");
    expect(src).toContain('author: "Alex"');
    expect(src).toContain("export const myCandle: ArtPiece");
    // The placeholder lore is rejected by the check, so a forgotten TODO cannot ship.
    const piece = { ...candle, lore: "TODO: one line" };
    expect(checkPiece(piece).errors.map((f) => f.id)).toContain("PR-lore");
  });
});

describe("review sheets", () => {
  it("renders every piece at full size, phone sizes and thumbnail with rules and provenance", () => {
    const html = sheetHtml([candle, crescent]);
    expect(html).toContain("Candle (worked example)");
    expect(html).toContain("8.5 px cube (phone)");
    expect(html).toContain("A-20");
    expect(html).toContain("not reviewed");
    expect(html.match(/<svg/g)).toHaveLength(2 * 4);
  });

  it("escapes text and marks a failing piece", () => {
    const html = sheetHtml([{ ...candle, name: "<b>x</b>", rows: ["zz"] }]);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("STRUCT");
  });

  it("says so when there is nothing yet", () => {
    expect(sheetHtml([])).toContain("No pieces yet.");
  });

  it("renders a PNG at the requested cube size on the board's panel colour", () => {
    const png = renderPng(candle, 10);
    expect(png.width).toBe(16 * 10 + 20);
    expect(png.height).toBe(20 * 10 + 20);
    expect([...png.data.slice(0, 4)]).toEqual([15, 8, 36, 255]);
    const bare = renderPng(candle, 10, false);
    expect(bare.width).toBe(160);
    expect(bare.data[3]).toBe(0);
  });
});
