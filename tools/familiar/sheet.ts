/**
 * Renders the familiar's contact sheet (docs/art/familiar-sheet.png): every frame, for several cube
 * colours, at actual mobile size (2×) and zoomed (8×) on the board's dark panel colour.
 *
 *   npm run familiar:sheet
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import {
  FAMILIAR_H,
  FAMILIAR_W,
  FRAME_NAMES,
  frameRgba,
} from "../../packages/game/src/collect/familiarArt";

export const SHEET_COLORS = [
  "#e24a4a",
  "#4ae26b",
  "#4a8bff",
  "#f2c94c",
  "#b44ae2",
  "#4ae2d8",
  "#ff8c42",
  "#f06bb0",
];
const PANEL = [15, 8, 36];

export function sheet(scale: number, colors: readonly string[] = SHEET_COLORS): PNG {
  const pad = 2 * scale;
  const cellW = FAMILIAR_W * scale + pad;
  const cellH = FAMILIAR_H * scale + pad;
  const width = FRAME_NAMES.length * cellW + pad;
  const height = colors.length * cellH + pad;
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = PANEL[0]!;
    png.data[i * 4 + 1] = PANEL[1]!;
    png.data[i * 4 + 2] = PANEL[2]!;
    png.data[i * 4 + 3] = 255;
  }
  colors.forEach((color, row) => {
    FRAME_NAMES.forEach((name, col) => {
      const rgba = frameRgba(name, color);
      const ox = pad + col * cellW;
      const oy = pad + row * cellH;
      for (let y = 0; y < FAMILIAR_H; y++) {
        for (let x = 0; x < FAMILIAR_W; x++) {
          const i = (y * FAMILIAR_W + x) * 4;
          if (rgba[i + 3] === 0) continue;
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              const j = ((oy + y * scale + dy) * width + ox + x * scale + dx) * 4;
              png.data[j] = rgba[i]!;
              png.data[j + 1] = rgba[i + 1]!;
              png.data[j + 2] = rgba[i + 2]!;
              png.data[j + 3] = 255;
            }
          }
        }
      }
    });
  });
  return png;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = new URL("../../docs/art/", import.meta.url);
  mkdirSync(fileURLToPath(dir), { recursive: true });
  const zoom = process.argv.includes("--small") ? 2 : 10;
  const out = new URL(zoom === 2 ? "familiar-sheet-mobile.png" : "familiar-sheet.png", dir);
  writeFileSync(fileURLToPath(out), PNG.sync.write(sheet(zoom)));
  console.log(`wrote ${fileURLToPath(out)}`);
}
