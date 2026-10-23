import { describe, expect, it } from "vitest";
import { SHADED_BEVEL, paintCube, shadeTonesGrid, tonesFor } from "./cubePaint";

describe("tonesFor", () => {
  it("lightens and darkens by the bevel, more for plain art than for shaded art", () => {
    const plain = tonesFor("#808080");
    const shaded = tonesFor("#808080", SHADED_BEVEL);
    expect(plain.base).toBe(0x808080);
    expect(plain.light).toBeGreaterThan(shaded.light);
    expect(plain.dark).toBeLessThan(shaded.dark);
  });
});

describe("shadeTonesGrid", () => {
  it("is null without shades", () => {
    expect(shadeTonesGrid({ width: 2, height: 1 })).toBeNull();
  });

  it("places each shade's tones on the padded grid and leaves the ring and empty cells undefined", () => {
    const grid = shadeTonesGrid({
      width: 3,
      height: 2,
      shades: { colors: ["#101010", "#f0f0f0"], cells: [0, -1, 1, 1, 0, -1] },
    })!;
    const stride = 5;
    expect(grid).toHaveLength(stride * 4);
    const at = (x: number, y: number) => grid[(y + 1) * stride + (x + 1)];
    expect(at(0, 0)?.base).toBe(0x101010);
    expect(at(1, 0)).toBeUndefined();
    expect(at(2, 0)?.base).toBe(0xf0f0f0);
    expect(at(0, 1)?.base).toBe(0xf0f0f0);
    expect(at(1, 1)?.base).toBe(0x101010);
    expect(at(2, 1)).toBeUndefined();
    // The one-cell ring around the mosaic is never filled.
    expect(grid.slice(0, stride).every((t) => t === undefined)).toBe(true);
    expect(grid[stride * 3 + 2]).toBeUndefined();
  });
});

describe("paintCube", () => {
  it("fills the cube then its four edges", () => {
    const calls: string[] = [];
    paintCube(
      {
        fillStyle: (c) => calls.push(`fill ${c}`),
        fillRect: (x, y, w, h) => calls.push(`rect ${x},${y},${w},${h}`),
      },
      10,
      20,
      12,
      { base: 1, light: 2, dark: 3 },
    );
    expect(calls[0]).toBe("fill 1");
    expect(calls).toContain("fill 2");
    expect(calls).toContain("fill 3");
    expect(calls.filter((c) => c.startsWith("rect"))).toHaveLength(5);
  });
});
