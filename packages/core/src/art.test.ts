import { describe, expect, it } from "vitest";
import { parseAsciiArt } from "./art";
import { EMPTY } from "./level";

describe("parseAsciiArt", () => {
  it("maps characters to palette indices in legend order, with . and space empty", () => {
    const art = parseAsciiArt({
      legend: { a: "#111111", b: "#222222", c: "#333333" },
      rows: ["ab.", " ca"],
    });
    expect(art).toEqual({
      width: 3,
      height: 2,
      palette: ["#111111", "#222222", "#333333"],
      cells: [0, 1, EMPTY, EMPTY, 2, 0],
    });
  });

  it("drops legend colors the art never uses", () => {
    const art = parseAsciiArt({
      legend: { a: "#111111", b: "#222222", c: "#333333" },
      rows: ["cc"],
    });
    expect(art.palette).toEqual(["#333333"]);
    expect(art.cells).toEqual([0, 0]);
  });

  it("rejects ragged rows, unknown characters, empty art and bad legend keys", () => {
    expect(() => parseAsciiArt({ legend: { a: "#111111" }, rows: ["aa", "a"] })).toThrow(
      "row 1 has 1 cells, expected 2",
    );
    expect(() => parseAsciiArt({ legend: { a: "#111111" }, rows: ["ax"] })).toThrow(
      'character "x" is not in the legend',
    );
    expect(() => parseAsciiArt({ legend: {}, rows: [] })).toThrow("art has no rows");
    expect(() => parseAsciiArt({ legend: { ".": "#111111" }, rows: ["."] })).toThrow(
      'invalid legend key "."',
    );
  });
});
