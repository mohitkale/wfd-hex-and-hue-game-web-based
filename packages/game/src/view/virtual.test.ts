import { describe, expect, it } from "vitest";
import { syncPlan } from "./virtual";

// Items every 100 px: 0, 100, …, 900.
const ys = Array.from({ length: 10 }, (_, i) => i * 100);

describe("syncPlan", () => {
  it("creates everything in the viewport at once, then a few ahead, closest first", () => {
    const plan = syncPlan(ys, new Set(), 300, 200, 250, 2);
    expect(plan.create).toEqual([3, 4, 5, 2, 6]);
    expect(plan.destroy).toEqual([]);
  });

  it("creates the rest of the margin on later calls", () => {
    const plan = syncPlan(ys, new Set([2, 3, 4, 5, 6]), 300, 200, 250, 2);
    expect(plan.create).toEqual([1, 7]);
  });

  it("destroys only items far outside the viewport (hysteresis against churn)", () => {
    const live = new Set([0, 1, 2, 3, 4, 5]);
    const plan = syncPlan(ys, live, 800, 100, 150, 5);
    expect(plan.destroy).toEqual([0, 1, 2, 3, 4]); // 5 is 300 px away: within 2 × margin
    expect(plan.create).toEqual([8, 9, 7]); // 6 is 200 px away: beyond the margin
  });
});
