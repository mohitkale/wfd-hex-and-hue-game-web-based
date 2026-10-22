import { describe, expect, it } from "vitest";
import { SYMBOLS, paintSymbol, reducedMotion, symbolFor, type PathContext } from "./a11y";
import { illumination, isLit, moonPhase, phaseName } from "./moon";
import { worlds } from "./levels";

/** Records the points a symbol paints, to compare shapes. */
function trace(index: number): string {
  const out: string[] = [];
  const ctx: PathContext = {
    beginPath: () => out.push("|"),
    moveTo: (x, y) => out.push(`m${x.toFixed(2)},${y.toFixed(2)}`),
    lineTo: (x, y) => out.push(`l${x.toFixed(2)},${y.toFixed(2)}`),
    arc: (x, y, r) => out.push(`a${r.toFixed(2)}`),
    closePath: () => {},
    fill: () => {},
  };
  paintSymbol(ctx, index, 0, 0, 2);
  return out.join(" ");
}

describe("colorblind symbols", () => {
  it("every shipped palette gets distinct symbols", () => {
    const most = Math.max(...worlds.flatMap((w) => w.levels.map((l) => l.level.palette.length)));
    expect(most).toBeLessThanOrEqual(SYMBOLS.length);
    const shapes = Array.from({ length: SYMBOLS.length }, (_, i) => trace(i));
    expect(new Set(shapes).size).toBe(SYMBOLS.length);
  });

  it("symbols stay inside their box", () => {
    for (const parts of SYMBOLS) {
      for (const part of parts) {
        if (part.kind === "circle") expect(part.r).toBeLessThanOrEqual(1);
        else for (const [x, y] of part.points) expect(Math.hypot(x, y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("wraps around for out-of-range indexes", () => {
    expect(symbolFor(SYMBOLS.length)).toBe(SYMBOLS[0]);
  });
});

describe("reduced motion", () => {
  it("follows the setting, or the system preference on 'system'", () => {
    expect(reducedMotion("on", false)).toBe(true);
    expect(reducedMotion("off", true)).toBe(false);
    expect(reducedMotion("system", true)).toBe(true);
    expect(reducedMotion("system", false)).toBe(false);
  });
});

describe("moon phase", () => {
  const near = (phase: number, target: number) =>
    Math.min(Math.abs(phase - target), 1 - Math.abs(phase - target));

  it("matches known new and full moons", () => {
    // New moon 2024-01-11 11:57 UTC, full moon 2024-01-25 17:54 UTC.
    expect(near(moonPhase(new Date(Date.UTC(2024, 0, 11, 11, 57))), 0)).toBeLessThan(0.03);
    expect(near(moonPhase(new Date(Date.UTC(2024, 0, 25, 17, 54))), 0.5)).toBeLessThan(0.03);
    expect(phaseName(moonPhase(new Date(Date.UTC(2024, 0, 25, 18))))).toBe("Full Moon");
    expect(moonPhase(new Date(Date.UTC(1990, 5, 1)))).toBeGreaterThanOrEqual(0);
  });

  it("names the eight phases", () => {
    expect([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 0.98].map(phaseName)).toEqual([
      "New Moon",
      "Waxing Crescent",
      "First Quarter",
      "Waxing Gibbous",
      "Full Moon",
      "Waning Gibbous",
      "Last Quarter",
      "Waning Crescent",
      "New Moon",
    ]);
  });

  it("lights the right side while waxing and the left while waning", () => {
    expect(illumination(0)).toBeCloseTo(0);
    expect(illumination(0.5)).toBeCloseTo(1);
    expect(isLit(0.5, 0, 0.25)).toBe(true);
    expect(isLit(-0.5, 0, 0.25)).toBe(false);
    expect(isLit(-0.5, 0, 0.75)).toBe(true);
    expect(isLit(0.5, 0, 0.75)).toBe(false);
    expect(isLit(0, 0, 0.02)).toBe(false);
    expect(isLit(0, 0, 0.5)).toBe(true);
    expect(isLit(1.1, 0, 0.5)).toBe(false);
  });
});
