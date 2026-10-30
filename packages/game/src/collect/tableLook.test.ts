import { describe, expect, it } from "vitest";
import { columnAlpha, paintBoard, paintPlate, paintTable, plankWidth, TABLE } from "./tableLook";
import { contrast, luminance } from "../theme";

const recorder = () => {
  const calls: { color: number; alpha: number }[] = [];
  let style = { color: 0, alpha: 1 };
  return {
    calls,
    fillStyle(color: number, alpha = 1) {
      style = { color, alpha };
    },
    fillRect() {
      calls.push(style);
    },
    fillRoundedRect() {
      calls.push(style);
    },
  };
};
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

describe("the table look (M15.13)", () => {
  it("the front box is bright and the ones behind it fade", () => {
    expect(columnAlpha(0)).toBe(1);
    expect(columnAlpha(1)).toBeLessThan(1);
    expect(columnAlpha(2)).toBeLessThan(columnAlpha(1));
  });

  it("covers the whole area with planks, the same table every time", () => {
    const a = recorder();
    const b = recorder();
    paintTable(a, { x: 0, y: 0, w: 750, h: 1600 }, plankWidth(750), 2);
    paintTable(b, { x: 0, y: 0, w: 750, h: 1600 }, plankWidth(750), 2);
    expect(a.calls).toEqual(b.calls);
    expect(a.calls[0]!.color).toBe(TABLE.wood);
    expect(plankWidth(750)).toBeGreaterThan(80);
  });

  it("paints the board and the plates", () => {
    const g = recorder();
    paintBoard(g, { x: 0, y: 0, w: 300, h: 300 }, 20, 2);
    paintPlate(g, { x: 0, y: 0, w: 60, h: 60 }, 2);
    expect(g.calls.map((c) => c.color)).toContain(TABLE.board);
    expect(g.calls.map((c) => c.color)).toContain(TABLE.plate);
  });

  it("the board and plates are see-through, and a plate stays inside its tray (the gap shows)", () => {
    expect(TABLE.boardAlpha).toBeLessThan(1);
    expect(TABLE.plateAlpha).toBeLessThan(1);
    const xs: number[] = [];
    const g = {
      fillStyle: () => undefined,
      fillRect: () => undefined,
      fillRoundedRect: (x: number, _y: number, w: number) => xs.push(x, x + w),
    };
    paintPlate(g, { x: 100, y: 0, w: 60, h: 60 }, 2);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...xs)).toBeLessThanOrEqual(160);
  });

  it("HUD ink reads on the buttons and the table", () => {
    for (const bg of [TABLE.button, TABLE.wood, TABLE.woodAlt])
      expect(contrast(luminance(TABLE.ink), luminance(hex(bg)))).toBeGreaterThanOrEqual(4.5);
  });
});
