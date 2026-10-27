import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { layeredOrb } from "../../packages/game/src/collect/denseBoard";
import { PHONES, SIZES, TICKS_PER_SECOND, botPlay, cubeCss } from "./density";

/** M11.2: denser art must stay legible, finishable and fast to draw (docs/V2_ART_DENSITY.md). */

describe("cube size on phones", () => {
  // M15.6: the uniform group tiles and the portal dock took another 4-8 % on the smallest phones, so
  // the 360+ wide floor is 7 (was 7.5). M15.3: the booster tray (M14.4) takes a 30 CSS px strip under the HUD on every non-tutorial level,
  // which moved the floors on the shortest phones: 8 → 6.5 at 40 per side (no shipped piece is that
  // big: the largest is 40 wide by 20 high and 32×30), 8.5 → 8 for standard pieces.
  it.each(PHONES)(
    "%s: a cube stays at least 6.5 CSS px up to 40 per side, 7 on 360+ wide, 8 up to 32",
    (...p) => {
      for (const size of SIZES) {
        const px = cubeCss(size, p);
        expect(px, `${p[0]} at ${size}`).toBeGreaterThanOrEqual(6.5);
        if (p[1] >= 360) expect(px, `${p[0]} at ${size}`).toBeGreaterThanOrEqual(7);
        // Standard pieces (up to 32 per side) get at least 8 CSS px on every phone.
        if (size <= 32) expect(px, `${p[0]} at ${size}`).toBeGreaterThanOrEqual(8);
      }
    },
  );
});

describe("more panels never shrink the cubes", () => {
  it("is no smaller with the most columns, slots and field tiles the engine allows", () => {
    const most = {
      columns: collect.COLLECT_LIMITS.maxColumns,
      slots: collect.COLLECT_LIMITS.maxSlots,
      fieldCap: collect.COLLECT_LIMITS.maxFieldCap,
    };
    for (const p of PHONES) {
      // More slots and field tiles make the tiles narrower, hence shorter, so the board only ever gains.
      for (const size of SIZES)
        expect(cubeCss(size, p, most)).toBeGreaterThanOrEqual(cubeCss(size, p));
    }
  });
});

describe("the shaded density test orb", () => {
  it.each([24, 32, 40])("%i×%i is a valid level with valid shades", (size) => {
    const level = layeredOrb(size);
    expect(collect.validateCollectLevel(level)).toEqual([]);
    expect(level.width).toBe(size);
    expect(level.shades).toBeDefined();
    expect(level.shades!.colors).toHaveLength(24);
    expect(new Set(level.palette).size).toBe(6);
  });

  it("32×32 has hundreds of cubes, six families and four shades in each", () => {
    const level = layeredOrb(32);
    const cubes = level.cells.filter((c) => c >= 0).length;
    expect(cubes).toBeGreaterThan(600);
    const usedShades = new Map<number, Set<number>>();
    level.cells.forEach((c, i) => {
      if (c < 0) return;
      const set = usedShades.get(c) ?? new Set<number>();
      set.add(level.shades!.cells[i]!);
      usedShades.set(c, set);
    });
    expect(usedShades.size).toBe(6);
    for (const set of usedShades.values()) expect(set.size).toBeGreaterThanOrEqual(2);
  });

  it("is lit from the upper left: lighter shades sit above and left of darker ones", () => {
    const level = layeredOrb(32);
    const light: number[][] = [];
    const dark: number[][] = [];
    level.shades!.cells.forEach((s, i) => {
      if (s < 0) return;
      const role = s % 4;
      const p = [i % 32, Math.floor(i / 32)];
      if (role === 3) light.push(p);
      if (role === 0) dark.push(p);
    });
    const mean = (ps: number[][]) => ps.reduce((a, p) => a + p[0]! + p[1]!, 0) / ps.length;
    expect(mean(light)).toBeLessThan(mean(dark));
  });

  it.each([24, 32, 40])("%i×%i can be finished, and 2× is the same game", (size) => {
    const level = layeredOrb(size);
    const eager = botPlay(level, true);
    expect(eager.status).toBe("won");
    expect(botPlay(level, false).status).toBe("won");
    // Play time is set by the squad, spawn gap and field cap, not by the picture size alone:
    // keep the test board in a sane range so a regression is noticed.
    const seconds = eager.ticks / TICKS_PER_SECOND;
    expect(seconds).toBeGreaterThan(20);
    expect(seconds).toBeLessThan(300);
  });
});
