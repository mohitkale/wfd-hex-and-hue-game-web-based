import { describe, expect, it } from "vitest";
import { MAX_CANVAS_PIXELS, nextRenderDpr, renderDpr } from "./display";

describe("renderDpr", () => {
  it("keeps phones at device resolution (capped at 3×)", () => {
    expect(renderDpr(3, 430, 932)).toBe(3);
    expect(renderDpr(2, 390, 844)).toBe(2);
    expect(renderDpr(4, 360, 640)).toBe(3);
  });

  it("lowers the ratio on big desktop windows to stay under the pixel budget", () => {
    const dpr = renderDpr(2, 1920, 1080);
    expect(dpr).toBeLessThan(2);
    expect(1920 * dpr * 1080 * dpr).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });

  it("never goes below 1, and treats a missing ratio as 1", () => {
    expect(renderDpr(1, 3840, 2160)).toBe(1);
    expect(renderDpr(2, 3840, 2160)).toBe(1);
    expect(renderDpr(0, 400, 800)).toBe(1);
  });

  it("is stable for small size changes (quarter steps)", () => {
    expect(renderDpr(2, 1600, 1000)).toBe(renderDpr(2, 1604, 1002));
  });
});

describe("nextRenderDpr", () => {
  it("keeps the current ratio for small resizes near the budget (no flip-flop while dragging)", () => {
    // 1280×800 at 2× is 4.1 MP: just under the budget.
    expect(renderDpr(2, 1280, 800)).toBe(2);
    expect(renderDpr(2, 1300, 820)).toBe(1.75);
    expect(nextRenderDpr(2, 2, 1300, 820)).toBe(2);
    expect(nextRenderDpr(1.75, 2, 1280, 800)).toBe(1.75);
  });

  it("follows big resizes", () => {
    expect(nextRenderDpr(2, 2, 1900, 1200)).toBe(renderDpr(2, 1900, 1200));
    expect(nextRenderDpr(1.25, 2, 390, 844)).toBe(2);
  });

  it("always follows a lower device ratio (window moved to another screen)", () => {
    expect(nextRenderDpr(2, 1, 1000, 700)).toBe(1);
  });
});
