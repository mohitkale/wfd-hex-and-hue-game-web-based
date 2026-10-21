import { describe, expect, it } from "vitest";
import { cellCenter, computeLayout, type Layout, type LayoutInput, type Rect } from "./layout";

const inside = (r: Rect, outer: Rect) =>
  r.x >= outer.x &&
  r.y >= outer.y &&
  r.x + r.w <= outer.x + outer.w &&
  r.y + r.h <= outer.y + outer.h;
const bottom = (r: Rect) => r.y + r.h;

const screens: Record<
  string,
  Omit<LayoutInput, "boardWidth" | "boardHeight" | "slots" | "columns">
> = {
  "iPhone 15 (notch)": {
    width: 393 * 3,
    height: 852 * 3,
    dpr: 3,
    insets: { top: 59 * 3, right: 0, bottom: 34 * 3, left: 0 },
  },
  "small Android": {
    width: 360 * 2,
    height: 640 * 2,
    dpr: 2,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  },
  "iPhone SE": {
    width: 320 * 2,
    height: 568 * 2,
    dpr: 2,
    insets: { top: 20 * 2, right: 0, bottom: 0, left: 0 },
  },
  "desktop browser": {
    width: 1440,
    height: 900,
    dpr: 1,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  },
  "phone landscape": {
    width: 852 * 3,
    height: 393 * 3,
    dpr: 3,
    insets: { top: 0, right: 59 * 3, bottom: 21 * 3, left: 59 * 3 },
  },
};

const boards = [
  { boardWidth: 12, boardHeight: 12, slots: 5, columns: 2 },
  { boardWidth: 24, boardHeight: 24, slots: 5, columns: 4 },
  { boardWidth: 32, boardHeight: 20, slots: 3, columns: 6 },
];

describe.each(Object.entries(screens))("%s", (_name, screen) => {
  it.each(boards)("fits a $boardWidth×$boardHeight board", (board) => {
    const l: Layout = computeLayout({ ...screen, ...board });
    const viewport = { x: 0, y: 0, w: screen.width, h: screen.height };
    const safe = {
      x: screen.insets.left,
      y: screen.insets.top,
      w: screen.width - screen.insets.left - screen.insets.right,
      h: screen.height - screen.insets.top - screen.insets.bottom,
    };

    expect(inside(l.frame, safe)).toBe(true);
    for (const r of [l.hud, l.boardRect, ...l.slots, ...l.columns]) {
      expect(inside(r, l.frame)).toBe(true);
      expect(inside(r, viewport)).toBe(true);
    }
    // Top-to-bottom order without overlap.
    expect(l.portal.y - l.portal.r).toBeGreaterThanOrEqual(bottom(l.hud));
    expect(l.portal.y + l.portal.r).toBeLessThanOrEqual(l.boardRect.y);
    expect(bottom(l.boardRect)).toBeLessThanOrEqual(l.slots[0]!.y);
    expect(bottom(l.slots[0]!)).toBeLessThanOrEqual(l.columns[0]!.y);
    // Whole pixels, board exactly (W+2)×(H+2) cells.
    expect(Number.isInteger(l.cell)).toBe(true);
    expect(l.cell).toBeGreaterThanOrEqual(1);
    expect(l.boardRect.w).toBe(l.cell * (board.boardWidth + 2));
    expect(l.boardRect.h).toBe(l.cell * (board.boardHeight + 2));
    expect(l.slots).toHaveLength(board.slots);
    expect(l.columns).toHaveLength(board.columns);
    // Columns side by side without overlap.
    for (let i = 1; i < l.columns.length; i++) {
      expect(l.columns[i]!.x).toBeGreaterThanOrEqual(l.columns[i - 1]!.x + l.columns[i - 1]!.w);
    }
  });
});

describe("computeLayout", () => {
  it("caps the play width on desktop and centers it", () => {
    const l = computeLayout({ ...screens["desktop browser"]!, ...boards[0]! });
    expect(l.frame.w).toBe(480);
    expect(l.frame.x).toBe((1440 - 480) / 2);
  });

  it("gives a 12×12 board big cells on a phone", () => {
    const l = computeLayout({ ...screens["iPhone 15 (notch)"]!, ...boards[0]! });
    expect(l.cell / l.dpr).toBeGreaterThanOrEqual(24);
  });

  it("maps grid coordinates, including the track ring, to cell centers", () => {
    const l = computeLayout({ ...screens["small Android"]!, ...boards[0]! });
    expect(cellCenter(l, -1, -1)).toEqual({
      x: l.boardRect.x + l.cell / 2,
      y: l.boardRect.y + l.cell / 2,
    });
    expect(cellCenter(l, 12, 12)).toEqual({
      x: l.boardRect.x + l.boardRect.w - l.cell / 2,
      y: l.boardRect.y + l.boardRect.h - l.cell / 2,
    });
  });
});
