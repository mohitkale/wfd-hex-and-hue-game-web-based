import { describe, expect, it } from "vitest";
import { parseAsciiArt } from "@hexhue/core";
import { Canvas, sprinkle } from "./draw";

describe("Canvas", () => {
  it("draws symmetric discs and rects", () => {
    expect(new Canvas(5, 5).disc(2, 2, 1, "y").rows()).toEqual([
      ".....",
      "..y..",
      ".yyy.",
      "..y..",
      ".....",
    ]);
    expect(new Canvas(4, 2, "n").rect(1, 0, 2, 1, "y").rows()).toEqual(["nyyn", "nnnn"]);
  });

  it("fills polygons, stars and lines inside bounds", () => {
    const c = new Canvas(7, 7).star(3, 3, 3, 1.3, 5, "s").line(0, 6, 6, 6, "l");
    expect(c.rows()[6]).toBe("lllllll");
    expect(c.get(3, 3)).toBe("s");
    expect(c.get(3, 1)).toBe("s"); // near the top point
    // Off-canvas writes are ignored.
    expect(() => c.set(-1, 99, "x")).not.toThrow();
  });

  it("stamps with transparency, swaps, mirrors and exports parseable art", () => {
    const c = new Canvas(4, 2, "n").stamp(0, 0, ["ab", ".b"]).swap("b", "c").mirrorX();
    expect(c.rows()).toEqual(["acca", "nccn"]);
    const art = parseAsciiArt(c.art({ n: "#4b3c9e", a: "#f6d97a", c: "#c9b8ff" }));
    expect(art.width).toBe(4);
  });

  it("sprinkles deterministically, only over the requested cells", () => {
    const a = sprinkle(new Canvas(20, 20, "n").rect(0, 0, 10, 20, "m"), "s", 0.3, 7, "n").rows();
    const b = sprinkle(new Canvas(20, 20, "n").rect(0, 0, 10, 20, "m"), "s", 0.3, 7, "n").rows();
    expect(a).toEqual(b);
    expect(a.every((r) => !r.slice(0, 10).includes("s"))).toBe(true);
    expect(a.join("").includes("s")).toBe(true);
  });
});
