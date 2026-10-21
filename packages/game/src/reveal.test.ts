import { describe, expect, it } from "vitest";
import { EMPTY } from "@hexhue/core";
import { revealOrder, revealedCount } from "./reveal";

const _ = EMPTY;

describe("revealOrder", () => {
  it("starts at the center and skips empty cells", () => {
    // 3×3 with an empty corner.
    const order = revealOrder(3, 3, [_, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(order[0]).toBe(4);
    expect(order).not.toContain(0);
    expect(new Set(order).size).toBe(8);
    // Edge midpoints (distance 1) before corners (distance 2).
    expect(order.slice(1, 5).sort()).toEqual([1, 3, 5, 7]);
  });

  it("is stable for equal distances", () => {
    expect(revealOrder(2, 1, [0, 0])).toEqual([0, 1]);
  });
});

describe("revealedCount", () => {
  it("goes from none to all, monotonically", () => {
    expect(revealedCount(100, 0, 900)).toBe(0);
    expect(revealedCount(100, 900, 900)).toBe(100);
    expect(revealedCount(100, 5000, 900)).toBe(100);
    let prev = 0;
    for (let ms = 0; ms <= 900; ms += 30) {
      const n = revealedCount(100, ms, 900);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(revealedCount(100, 450, 900)).toBe(50);
  });
});
