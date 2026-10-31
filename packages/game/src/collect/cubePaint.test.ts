import { describe, expect, it } from "vitest";
import { SHADED_BEVEL, paintCube, shadeTonesGrid, tonesFor } from "./cubePaint";

const paintedEdge = (t: { base: number; light: number; dark: number }): number => {
  let first = -1;
  paintCube(
    {
      fillStyle: (c: number) => {
        if (first < 0) first = c;
      },
      fillRect: () => undefined,
      fillRoundedRect: () => undefined,
    },
    0,
    0,
    20,
    t,
  );
  return first;
};

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
  const record = () => {
    const calls: string[] = [];
    return {
      calls,
      g: {
        fillStyle: (c: number, a?: number) =>
          calls.push(`fill ${c}${a === undefined ? "" : ` @${a}`}`),
        fillRect: (x: number, y: number, w: number, h: number) =>
          calls.push(`rect ${x},${y},${w},${h}`),
        fillRoundedRect: (x: number, y: number, w: number, h: number, r: number) =>
          calls.push(`round ${x},${y},${w},${h} r${r}`),
      },
    };
  };

  it("is the square top face of a 3D block: a line where faces meet, a lit top and left (M15.13)", () => {
    const { calls, g } = record();
    paintCube(g, 10, 20, 20, { base: 1, light: 2, dark: 3 });
    // The edge is only partly toward the dark tone: lighter than it, darker than the face.
    const edge = paintedEdge({ base: 0x808080, light: 0xc0c0c0, dark: 0x202020 });
    expect(edge).toBeGreaterThan(0x202020);
    expect(edge).toBeLessThan(0x808080);
    expect(calls).toContain("fill 1");
    expect(calls).toContain("fill 2 @0.8");
    expect(calls.some((c) => c.startsWith("fill 16777215"))).toBe(false);
    // Square, no rounding (owner decision): cubes meet edge to edge; the depth is the board's front faces.
    expect(calls.filter((c) => c.startsWith("round"))).toHaveLength(0);
  });

  it("stays inside its square, even tiny", () => {
    for (const size of [4, 7, 13, 40]) {
      const { calls, g } = record();
      paintCube(g, 100, 100, size, { base: 1, light: 2, dark: 3 });
      for (const c of calls.filter((x) => x.startsWith("round"))) {
        const [x, y, w, h] = c.slice(6).split(" ")[0]!.split(",").map(Number) as [
          number,
          number,
          number,
          number,
        ];
        expect(x).toBeGreaterThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(100);
        expect(x + w).toBeLessThanOrEqual(100 + size + 1e-9);
        expect(y + h).toBeLessThanOrEqual(100 + size + 1e-9);
      }
    }
  });
});
