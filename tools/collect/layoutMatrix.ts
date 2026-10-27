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
import { DEVICE_MATRIX } from "../../packages/game/src/collect/deviceMatrix";

export function table(): string {
  const f = (n: number) => (Math.round(n * 10) / 10).toString();
  const lines = [
    "| Device | Viewport @ dpr | Cube | Column | Tray | Column number | Tray number |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const [name, w, h, dpr] of DEVICE_MATRIX) {
    const l = computeCollectLayout({
      width: Math.round(w * dpr),
      height: Math.round(h * dpr),
      dpr,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      boardWidth: 24,
      boardHeight: 24,
      slots: 2,
      columns: 4,
      fieldCap: 3,
      portalX: 11,
      tray: true,
    });
    const css = (v: number) => v / dpr;
    const front = badgeBox(l, "column", 0, 0);
    const field = badgeBox(l, "tray", 0, 0);
    lines.push(
      `| ${name} | ${w}×${h} @${dpr} | ${f(css(l.cell))} | ${f(css(l.columns[0]!.w))}×${f(css(l.columns[0]!.h))} | ${f(css(l.trays[0]!.w))} | ${f(css(badgeFontPx(front.w, front.h)))} | ${f(css(badgeFontPx(field.w, field.h)))} |`,
    );
  }
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) console.log(table());
