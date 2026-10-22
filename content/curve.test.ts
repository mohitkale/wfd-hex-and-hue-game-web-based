import { describe, expect, it } from "vitest";
import { OPENERS, curveOptions, type WorldCurve } from "./curve";

const curve: WorldCurve = { world: 1, from: 0.1, to: 0.4, minSlots: 4, chunk: { min: 5, max: 12 } };

describe("curveOptions", () => {
  it("openers teach: one-lap charges, no target, roomy slots", () => {
    for (let i = 0; i < OPENERS; i++) {
      const o = curveOptions(curve, i, 20);
      expect(o.charges).toBe("reach");
      expect(o.targetDifficulty).toBeUndefined();
      expect(o.slots).toBe(5);
    }
  });

  it("targets rise from `from` to `to`, slots fall to minSlots, columns grow", () => {
    const opts = Array.from({ length: 20 }, (_, i) => curveOptions(curve, i, 20)).slice(OPENERS);
    expect(opts[0]!.targetDifficulty).toBe(0.1);
    expect(opts.at(-1)!.targetDifficulty).toBe(0.4);
    for (let i = 1; i < opts.length; i++) {
      expect(opts[i]!.targetDifficulty!).toBeGreaterThanOrEqual(opts[i - 1]!.targetDifficulty!);
      expect(opts[i]!.slots).toBeLessThanOrEqual(opts[i - 1]!.slots);
      expect(opts[i]!.columns).toBeGreaterThanOrEqual(opts[i - 1]!.columns);
    }
    expect(opts.at(-1)!.slots).toBe(4);
    expect(opts.at(-1)!.columns).toBe(4);
  });

  it("gives every level its own seed and honours overrides", () => {
    const seeds = Array.from({ length: 20 }, (_, i) => curveOptions(curve, i, 20).seed);
    expect(new Set(seeds).size).toBe(20);
    expect(curveOptions(curve, 10, 20, { columns: 2 }).columns).toBe(2);
  });
});
