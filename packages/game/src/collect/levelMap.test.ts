import { describe, expect, it } from "vitest";
import {
  clampScroll,
  decay,
  mapGeometry,
  MAP_PAD_BOTTOM_CSS,
  scrollToStop,
  STOP_GAP_CSS,
  stopAt,
} from "./levelMap";

describe("the level map (M15.13)", () => {
  const geo = mapGeometry(18, 750, 2);

  it("grows with the levels instead of squeezing them: every stop a fixed gap above the last", () => {
    expect(geo.stops).toHaveLength(18);
    expect(geo.stops[0]!.y).toBeCloseTo(geo.height - MAP_PAD_BOTTOM_CSS * 2);
    for (let i = 1; i < 18; i++)
      expect(geo.stops[i - 1]!.y - geo.stops[i]!.y).toBeCloseTo(STOP_GAP_CSS * 2);
    expect(mapGeometry(40, 750, 2).height).toBeGreaterThan(geo.height);
  });

  it("winds left and right inside the screen, and the path passes through every stop", () => {
    const xs = geo.stops.map((s) => s.x);
    expect(Math.min(...xs)).toBeLessThan(375);
    expect(Math.max(...xs)).toBeGreaterThan(375);
    for (const x of xs) expect(x).toBeGreaterThan(0);
    for (const x of xs) expect(x).toBeLessThan(750);
    expect(geo.pathAt(3)).toEqual(geo.stops[3]);
  });

  it("scrolls only within the map, and opens on the next level", () => {
    expect(clampScroll(-50, 1000, 400)).toBe(0);
    expect(clampScroll(900, 1000, 400)).toBe(600);
    expect(clampScroll(100, 300, 400)).toBe(0);
    const view = 900;
    const y = scrollToStop(geo, 8, view);
    const onScreen = geo.stops[8]!.y - y;
    expect(onScreen).toBeGreaterThan(view * 0.3);
    expect(onScreen).toBeLessThan(view * 0.8);
    // The first level opens at the bottom of the map.
    expect(scrollToStop(geo, 0, view)).toBe(geo.height - view);
  });

  it("a flick slows down and stops, and a tap finds the stop under it", () => {
    expect(decay(10, 0)).toBe(10);
    expect(decay(10, 320)).toBeCloseTo(10 / Math.E);
    expect(Math.abs(decay(10, 5000))).toBeLessThan(0.01);
    const s = geo.stops[5]!;
    expect(stopAt(geo, { x: s.x + 5, y: s.y - 5 }, 40)).toBe(5);
    expect(stopAt(geo, { x: s.x + 100, y: s.y + 100 }, 40)).toBe(-1);
  });
});
