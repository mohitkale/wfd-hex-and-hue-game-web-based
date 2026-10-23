import { describe, expect, it } from "vitest";
import { PANEL } from "./check";
import { candle, crescent } from "./fixtures";
import { HOUSE_BASES, HOUSE_FAMILIES, houseRamp, nearestHouseShade } from "./families";
import { parseHex } from "./color";
import { checkPiece, type Finding } from "./rules";
import { parsePiece, pieceToArt, type ArtPiece } from "./piece";

const byId = (findings: Finding[], id: string) => findings.find((f) => f.id === id)!;
const edit = (piece: ArtPiece, over: Partial<ArtPiece>): ArtPiece => ({ ...piece, ...over });
const failing = (piece: ArtPiece, options = {}) =>
  checkPiece(piece, options).errors.map((f) => f.id);

describe("house families", () => {
  it("the literal ramps equal the documented mixes of each base", () => {
    for (const [name, base] of Object.entries(HOUSE_BASES)) {
      expect(HOUSE_FAMILIES[name], name).toEqual(houseRamp(base));
    }
  });

  it("every house shade reads on the board panel (the floor of rule A-16)", () => {
    for (const [name, ramp] of Object.entries(HOUSE_FAMILIES)) {
      for (const hex of Object.values(ramp)) {
        const c = parseHex(hex);
        const l = (v: number) =>
          v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
        const lum = (x: number[]) => 0.2126 * l(x[0]!) + 0.7152 * l(x[1]!) + 0.0722 * l(x[2]!);
        const ratio = (lum(c) + 0.05) / (lum([...PANEL]) + 0.05);
        expect(ratio, `${name} ${hex}`).toBeGreaterThanOrEqual(1.6);
      }
    }
  });

  it("finds the nearest house shade of an arbitrary colour", () => {
    expect(nearestHouseShade(parseHex("#f6c945"))).toMatchObject({ family: "Gold", role: "base" });
    expect(nearestHouseShade(parseHex("#7e2a4d"))).toMatchObject({ family: "Ruby", role: "deep" });
  });
});

describe("the worked examples of the art bible", () => {
  it.each([candle, crescent])("$id passes every rule with no warning", (piece) => {
    const report = checkPiece(piece);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.findings.filter((f) => f.id.startsWith("A-"))).toHaveLength(20);
  });

  it("measures what the scorecards in the document say", () => {
    const c = checkPiece(candle).findings;
    expect(byId(c, "A-01").measured).toBe("16×20, 152 cells");
    expect(byId(c, "A-13").measured).toContain("79");
    expect(byId(c, "A-19").measured).toBe("glint 2.6 %");
    expect(byId(c, "A-20").measured).toBe("mask IoU 0.88");
    expect(byId(c, "A-31").measured).toContain("largest flat rectangle 15 cells = 4.7 %");
    const m = checkPiece(crescent).findings;
    expect(byId(m, "A-01").measured).toBe("24×24, 219 cells");
    expect(byId(m, "A-20").measured).toBe("mask IoU 0.79");
    expect(byId(m, "A-33").measured).toBe("backdrop 24 % of filled, 3 shades");
  });

  it("reports the density metrics", () => {
    const m = checkPiece(candle).metrics!;
    expect(m).toMatchObject({ width: 16, height: 20, filled: 152, families: 3, shades: 13 });
    expect(m.perFamily.Moonstone).toBeGreaterThan(m.perFamily.Gold!);
  });

  it("converts to the gameplay art and the shade layer the engine accepts", () => {
    const { art, shades } = pieceToArt(candle);
    expect(art.palette).toHaveLength(3);
    expect(art.cells.filter((c) => c >= 0)).toHaveLength(152);
    expect(shades.colors).toHaveLength(13);
    shades.cells.forEach((s, i) => {
      if (s < 0) expect(art.cells[i]).toBe(-1);
      else expect(shades.family[s]).toBe(art.cells[i]);
    });
  });
});

describe("rules fail on bad art", () => {
  const rows = (piece: ArtPiece, f: (r: string[]) => string[]) =>
    edit(piece, { rows: f([...piece.rows]) });
  const withLegend = (piece: ArtPiece, legend: ArtPiece["legend"]) =>
    edit(piece, { legend: { ...piece.legend, ...legend } });

  it("A-01 / A-02 / A-03: too small, tiny in a big frame, filled to the corners", () => {
    expect(failing(rows(candle, (r) => r.slice(0, 10)))).toContain("A-01");
    const tiny = rows(candle, (r) => [
      ...Array<string>(10).fill(".".repeat(40)),
      ...r.map((row) => ".".repeat(12) + row + ".".repeat(12)),
      ...Array<string>(10).fill(".".repeat(40)),
    ]);
    expect(failing(tiny)).toContain("A-02");
    const filledCorners = rows(candle, (r) =>
      r.map((row, y) => (y === 0 ? "Y" + row.slice(1) : row)),
    );
    expect(failing(filledCorners)).not.toContain("A-03");
    const full = rows(candle, (r) => r.map((row) => row.replace(/\./g, "m")));
    expect(failing(full)).toEqual(expect.arrayContaining(["A-03", "A-31"]));
  });

  it("A-10: a piece of one family is not a picture", () => {
    const mono = edit(candle, {
      rows: candle.rows.map((r) => r.replace(/[hmsdaAvu]/g, "Y")),
    });
    expect(failing(mono)).toContain("A-10");
  });

  it("A-12 / A-13: families too alike, shades of different families too close", () => {
    const twins = edit(candle, {
      families: { Amber: { base: "#f4c447" } },
      legend: { ...candle.legend, a: ["Amber", "base"] },
    });
    expect(failing(twins)).toContain("A-12");
    const clash = withLegend(candle, { h: ["Night", "light"] });
    expect(failing(clash)).toContain("A-13");
  });

  it("A-14 / A-15 / A-16: invisible steps, a hue that wanders, too dark for the board", () => {
    const flat = edit(candle, {
      families: { Mud: { base: "#c9bde6", light: "#cdc1ea", shade: "#c5b9e2" } },
      legend: { ...candle.legend, h: ["Mud", "light"], m: ["Mud", "base"], s: ["Mud", "shade"] },
    });
    expect(failing(flat)).toContain("A-14");
    const drifting = edit(candle, {
      families: { Lava: { base: "#f6c945", shade: "#4a82e8" } },
      legend: { ...candle.legend, O: ["Lava", "shade"], Y: ["Lava", "base"] },
    });
    expect(failing(drifting)).toContain("A-15");
    const dark = edit(candle, {
      families: { Ink: { base: "#101010", deep: "#080808" } },
      legend: { ...candle.legend, u: ["Ink", "deep"], A: ["Ink", "base"] },
    });
    expect(failing(dark)).toContain("A-16");
  });

  it("A-17 warns (does not fail) on pairs that collapse under deuteranopia", () => {
    const pair = edit(candle, {
      legend: {
        ...candle.legend,
        a: ["Teal", "light"],
        A: ["Teal", "base"],
        v: ["Teal", "shade"],
        u: ["Teal", "deep"],
        m: ["Rose", "base"],
        h: ["Rose", "light"],
        s: ["Rose", "shade"],
        d: ["Rose", "deep"],
      },
    });
    const report = checkPiece(pair);
    expect(report.warnings.map((f) => f.id)).toContain("A-17");
    expect(byId(report.findings, "A-17").measured).toMatch(/Rose\/Teal|Teal\/Rose/);
    expect(report.errors.map((f) => f.id)).not.toContain("A-17");
  });

  it("A-18: light from the wrong side fails", () => {
    const flipped = rows(candle, (r) =>
      r.map((row) =>
        [...row]
          .reverse()
          .join("")
          .replace(/./g, (c) => c),
      ),
    );
    expect(failing(flipped)).toContain("A-18");
  });

  it("A-19: too many glints", () => {
    const sparkly = rows(candle, (r) => r.map((row) => row.replace(/Y/g, "W")));
    expect(failing(sparkly)).toContain("A-19");
  });

  it("A-21: a piece with no shaded edge, and one outlined entirely in deep", () => {
    const light = edit(candle, {
      legend: {
        ...candle.legend,
        s: ["Moonstone", "base"],
        d: ["Moonstone", "light"],
        O: ["Gold", "base"],
        v: ["Amethyst", "base"],
        u: ["Amethyst", "light"],
      },
    });
    expect(failing(light)).toContain("A-21");
  });

  it("A-30 / A-34: scattered single cells are noise", () => {
    const speckled = rows(crescent, (r) =>
      r.map((row, y) =>
        y % 3 === 0
          ? [...row].map((c, x) => (c === "." && (x + y) % 5 === 0 ? "m" : c)).join("")
          : row,
      ),
    );
    const ids = failing(speckled);
    expect(ids).toEqual(expect.arrayContaining(["A-30"]));
    // Marking a legend character as an intentional feature exempts it.
    expect(failing(edit(speckled, { features: "m" }))).not.toContain("A-30");
  });

  it("A-31: a giant flat block is not allowed", () => {
    const slab = rows(candle, (r) =>
      r.map((row, y) => (y >= 7 && y < 16 ? "....mmmmmmmm...." : row)),
    );
    expect(failing(slab)).toContain("A-31");
  });

  it("A-32: a dithered checkerboard fails", () => {
    const checker = rows(crescent, (r) =>
      r.map((row, y) =>
        [...row].map((c, x) => (c === "A" ? ((x + y) % 2 ? "m" : "A") : c)).join(""),
      ),
    );
    expect(failing(checker)).toContain("A-32");
  });

  it("A-33: a backdrop that is most of the picture", () => {
    const sky = edit(candle, { backdrop: ["Moonstone"] });
    expect(failing(sky)).toContain("A-33");
  });
});

describe("provenance", () => {
  const ok = (over: Partial<ArtPiece["provenance"]>): ArtPiece =>
    edit(candle, { provenance: { ...candle.provenance, ...over } });

  it("accepts an unreviewed draft in the library but not on a shipped level", () => {
    expect(failing(candle)).toEqual([]);
    expect(failing(candle, { shipped: true })).toEqual(["PR-reviewed"]);
  });

  it("requires a licence from the closed list", () => {
    expect(failing(ok({ licence: "whatever" as never }))).toContain("PR-licence");
  });

  it("warns when a shipped piece still has the owner's licence undecided", () => {
    const report = checkPiece(
      ok({ reviewed: true, reviewedBy: "Mohit", reviewedOn: "2026-10-23" }),
      { shipped: true },
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((f) => f.id)).toEqual(["PR-licence-pending"]);
  });

  it("a review needs a named human and a date; CI and models do not count", () => {
    expect(failing(ok({ reviewed: true }))).toContain("PR-reviewer");
    expect(failing(ok({ reviewed: true, reviewedBy: "CI", reviewedOn: "2026-10-23" }))).toContain(
      "PR-reviewer",
    );
    expect(
      failing(ok({ reviewed: true, reviewedBy: "Claude", reviewedOn: "2026-10-23" })),
    ).toContain("PR-reviewer");
    expect(failing(ok({ reviewed: true, reviewedBy: "Mohit", reviewedOn: "yesterday" }))).toContain(
      "PR-reviewer",
    );
    expect(failing(ok({ reviewed: true, reviewedBy: "Mohit", reviewedOn: "2026-10-23" }))).toEqual(
      [],
    );
  });

  it("a generated draft can be neither reviewed nor shipped", () => {
    expect(failing(ok({ source: "generated-draft" }))).toEqual([]);
    expect(
      failing(
        ok({
          source: "generated-draft",
          reviewed: true,
          reviewedBy: "Mohit",
          reviewedOn: "2026-10-23",
        }),
      ),
    ).toContain("PR-draft");
    expect(failing(ok({ source: "generated-draft" }), { shipped: true })).toContain("PR-draft");
  });

  it("needs an author, a sensible id and a short lore line", () => {
    expect(failing(ok({ author: " " }))).toContain("PR-author");
    expect(failing(edit(candle, { id: "Bad Id" }))).toContain("PR-id");
    expect(failing(edit(candle, { lore: "" }))).toContain("PR-lore");
    expect(failing(edit(candle, { lore: "x".repeat(141) }))).toContain("PR-lore");
  });
});

describe("structure", () => {
  it("turns a malformed picture into one STRUCT finding instead of throwing", () => {
    expect(failing(edit(candle, { rows: ["ab", "a"] }))).toEqual(["STRUCT"]);
    expect(failing(edit(candle, { rows: ["zz", "zz"] }))).toEqual(["STRUCT"]);
    expect(failing(edit(candle, { legend: { ...candle.legend, Y: ["Nowhere", "base"] } }))).toEqual(
      ["STRUCT"],
    );
    expect(() => parsePiece(edit(candle, { rows: [] }))).toThrow("no rows");
  });
});
