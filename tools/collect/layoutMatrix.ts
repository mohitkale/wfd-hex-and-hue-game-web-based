/**
 * The v2 play screen on the device matrix of docs/QA.md (docs/V2_INTERFACE.md): cube size, summon
 * column, holding slot and the group numbers' font size, all in CSS px, for a 24×24 board with five
 * slots and four columns (the design's typical level).
 *
 *   npm run layout:matrix
 */
import { pathToFileURL } from "node:url";
import { badgeBox, badgeFontPx } from "../../packages/game/src/collect/badgeBox";
import { computeCollectLayout } from "../../packages/game/src/collect/collectLayout";

export const DEVICES: [string, number, number, number][] = [
  ["iPhone SE (1st gen)", 320, 568, 2],
  ["iPhone SE (2nd gen)", 375, 667, 2],
  ["iPhone 15", 393, 852, 3],
  ["Pixel 7", 412, 915, 2.625],
  ["Galaxy S8", 360, 740, 3],
  ["iPad", 768, 1024, 2],
  ["iPad (landscape)", 1024, 768, 2],
  ["Desktop", 1440, 900, 1],
  ["Phone (landscape)", 844, 390, 3],
];

export function table(): string {
  const f = (n: number) => (Math.round(n * 10) / 10).toString();
  const lines = [
    "| Device | Viewport @ dpr | Cube | Column | Slot | Front number | Field number |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const [name, w, h, dpr] of DEVICES) {
    const l = computeCollectLayout({
      width: Math.round(w * dpr),
      height: Math.round(h * dpr),
      dpr,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      boardWidth: 24,
      boardHeight: 24,
      slots: 5,
      columns: 4,
      fieldCap: 3,
      portalX: 11,
    });
    const css = (v: number) => v / dpr;
    const front = badgeBox(l, "column", 0, 0);
    const field = badgeBox(l, "field", 0, 0);
    lines.push(
      `| ${name} | ${w}×${h} @${dpr} | ${f(css(l.cell))} | ${f(css(l.columns[0]!.w))}×${f(css(l.columns[0]!.h))} | ${f(css(l.slots[0]!.w))} | ${f(css(badgeFontPx(front.w, front.h, false)))} | ${f(css(badgeFontPx(field.w, field.h, false)))} |`,
    );
  }
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) console.log(table());
