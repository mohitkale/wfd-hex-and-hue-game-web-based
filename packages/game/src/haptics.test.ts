import { describe, expect, it } from "vitest";
import { COLLECT_THROTTLE_MS, Haptics, PATTERNS } from "./haptics";

function setup() {
  const calls: number[][] = [];
  let t = 1000;
  const h = new Haptics(
    (p) => calls.push(p),
    () => t,
  );
  return { h, calls, advance: (ms: number) => (t += ms) };
}

describe("Haptics", () => {
  it("plays the pattern for each kind", () => {
    const { h, calls } = setup();
    h.play("tap");
    h.play("win");
    expect(calls).toEqual([[...PATTERNS.tap], [...PATTERNS.win]]);
  });

  it("throttles collect pulses but not other kinds", () => {
    const { h, calls, advance } = setup();
    h.play("collect");
    h.play("collect");
    h.play("tap");
    advance(COLLECT_THROTTLE_MS);
    h.play("collect");
    expect(calls).toEqual([[...PATTERNS.collect], [...PATTERNS.tap], [...PATTERNS.collect]]);
  });

  it("is silent when disabled or unsupported", () => {
    const { h, calls } = setup();
    h.enabled = false;
    h.play("tap");
    expect(calls).toEqual([]);
    expect(() => new Haptics(null).play("tap")).not.toThrow();
  });
});
