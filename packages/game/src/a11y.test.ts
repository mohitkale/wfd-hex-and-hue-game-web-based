import { describe, expect, it } from "vitest";
import { SYMBOLS, paintSymbol, reducedMotion, symbolFor, type PathContext } from "./a11y";
import { JOURNEY } from "./collect/journey";

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
    const most = Math.max(...JOURNEY.map((e) => e.base().palette.length));
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
