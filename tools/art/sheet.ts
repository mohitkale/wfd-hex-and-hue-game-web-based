/**
 * Preview and review sheets for v2 art (docs/ART_DIRECTION_V2.md §6): every piece at full size, at
 * the cube sizes of real phones, as a thumbnail, with its density report, rule results and
 * provenance.
 *
 *   npm run art:sheet     # writes dist/art-sheet.html
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { pieces } from "../../content/v2art";
import { PANEL } from "./check";
import { parseHex, toHex } from "./color";
import { parsePiece, type ArtPiece } from "./piece";
import { checkPiece } from "./rules";

/** Cube pitch in CSS px on a 320 px and a 393 px phone for a 32-per-side piece (V2_ART_DENSITY.md). */
export const PHONE_PITCHES = [8.5, 10.7] as const;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** A piece as an RGBA image: `pitch` px per cube with the board's gap, on the dark panel. */
export function renderPng(piece: ArtPiece, pitch: number, panel = true): PNG {
  const parsed = parsePiece(piece);
  const gap = pitch >= 6 ? Math.max(1, Math.floor(pitch / 12)) : 0;
  const size = Math.max(1, Math.round(pitch));
  const margin = panel ? Math.round(pitch) : 0;
  const width = parsed.width * size + 2 * margin;
  const height = parsed.height * size + 2 * margin;
  const png = new PNG({ width, height });
  const [pr, pg, pb] = PANEL;
  for (let i = 0; i < width * height; i++) {
    png.data.set(panel ? [pr, pg, pb, 255] : [0, 0, 0, 0], i * 4);
  }
  parsed.cells.forEach((cell, i) => {
    if (!cell) return;
    const [r, g, b] = parseHex(cell.hex);
    const x0 = margin + (i % parsed.width) * size;
    const y0 = margin + Math.floor(i / parsed.width) * size;
    for (let y = 0; y < size - gap; y++) {
      for (let x = 0; x < size - gap; x++)
        png.data.set([r, g, b, 255], ((y0 + y) * width + x0 + x) * 4);
    }
  });
  return png;
}

/**
 * All pieces on one PNG at `pitch` px per cube on the board's panel colour, laid out in rows no
 * wider than `maxWidth`. The committed contact sheets (docs/art/v2) come from here, and a test fails
 * when they are stale.
 */
export function contactSheetPng(library: readonly ArtPiece[], pitch: number, maxWidth = 1400): PNG {
  const gutter = Math.round(pitch * 2);
  const images = library.map((p) => renderPng(p, pitch));
  const placed: { png: PNG; x: number; y: number }[] = [];
  let x = gutter;
  let y = gutter;
  let rowH = 0;
  let width = maxWidth;
  for (const png of images) {
    if (x + png.width + gutter > maxWidth && x > gutter) {
      x = gutter;
      y += rowH + gutter;
      rowH = 0;
    }
    placed.push({ png, x, y });
    x += png.width + gutter;
    rowH = Math.max(rowH, png.height);
    width = Math.max(width, x);
  }
  const sheet = new PNG({ width: Math.min(width, maxWidth + gutter), height: y + rowH + gutter });
  const [pr, pg, pb] = PANEL;
  for (let i = 0; i < sheet.width * sheet.height; i++) sheet.data.set([pr, pg, pb, 255], i * 4);
  // The pieces are drawn on the panel colour already, so a visible frame separates them.
  for (const { png, x: ox, y: oy } of placed) {
    for (let row = 0; row < png.height; row++) {
      const from = row * png.width * 4;
      sheet.data.set(
        png.data.subarray(from, from + png.width * 4),
        ((oy + row) * sheet.width + ox) * 4,
      );
    }
    const frame = [48, 32, 92, 255];
    for (let i = 0; i < png.width; i++) {
      sheet.data.set(frame, (oy * sheet.width + ox + i) * 4);
      sheet.data.set(frame, ((oy + png.height - 1) * sheet.width + ox + i) * 4);
    }
    for (let j = 0; j < png.height; j++) {
      sheet.data.set(frame, ((oy + j) * sheet.width + ox) * 4);
      sheet.data.set(frame, ((oy + j) * sheet.width + ox + png.width - 1) * 4);
    }
  }
  return sheet;
}

function svg(piece: ArtPiece, pitch: number): string {
  const parsed = parsePiece(piece);
  const gap = pitch >= 6 ? Math.max(1, Math.floor(pitch / 12)) : 0;
  const rects = parsed.cells
    .map((c, i) =>
      c
        ? `<rect x="${(i % parsed.width) * pitch}" y="${Math.floor(i / parsed.width) * pitch}" width="${pitch - gap}" height="${pitch - gap}" fill="${c.hex}"/>`
        : "",
    )
    .join("");
  return `<svg width="${parsed.width * pitch}" height="${parsed.height * pitch}" shape-rendering="crispEdges">${rects}</svg>`;
}

export function sheetHtml(library: readonly ArtPiece[]): string {
  const panel = toHex([...PANEL]);
  const cards = library
    .map((piece) => {
      const report = checkPiece(piece);
      const status = report.errors.length ? "fail" : report.warnings.length ? "warn" : "ok";
      const m = report.metrics;
      const rows = report.findings
        .map(
          (f) =>
            `<tr class="${f.ok ? "" : f.severity}"><td>${f.ok ? "✓" : f.severity === "error" ? "✗" : "⚠"}</td><td>${esc(f.id)}</td><td>${esc(f.measured)}</td></tr>`,
        )
        .join("");
      const body = m
        ? `<div class="views">
  <figure>${svg(piece, 14)}<figcaption>full size</figcaption></figure>
  ${PHONE_PITCHES.map((p) => `<figure>${svg(piece, p)}<figcaption>${p} px cube (phone)</figcaption></figure>`).join("")}
  <figure>${svg(piece, 2)}<figcaption>thumbnail</figcaption></figure>
</div>
<p class="metrics">${m.width}×${m.height} · ${m.filled} cubes (${m.fillPercent} % of the grid) · ${m.families} families · ${m.shades} shades · mean run ${m.meanRun}</p>`
        : '<p class="fail">The picture could not be read: see STRUCT below.</p>';
      return `<section class="${status}"><h2>${esc(piece.name)} <small>${esc(piece.theme)} · ${esc(piece.id)}</small></h2>
<p><i>${esc(piece.lore)}</i></p>${body}
<p class="prov">${esc(piece.provenance.source)} · ${esc(piece.provenance.licence)} · ${piece.provenance.reviewed ? `reviewed by ${esc(piece.provenance.reviewedBy ?? "?")} on ${esc(piece.provenance.reviewedOn ?? "?")}` : "<b>not reviewed</b>"}</p>
<table>${rows}</table></section>`;
    })
    .join("\n");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hex & Hue v2 art sheet</title>
<style>
body{background:#140b2e;color:#f5efff;font:14px system-ui;margin:24px}
section{background:${panel};border-radius:12px;padding:16px;margin:0 0 24px}
.views{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}
figure{margin:0}figcaption,small,i,.metrics,.prov{color:#b9a9e6}
table{border-collapse:collapse;margin-top:8px}td{padding:2px 10px 2px 0;font-size:12px}
.error td,.fail{color:#ff8fa3}.warning td,.warn h2{color:#f6d97a}
</style><h1>Hex & Hue v2 art sheet</h1>${cards || "<p>No pieces yet.</p>"}`;
}

/** The committed contact sheets: every piece at 10 px (full size) and 9 px (a 320 px phone). */
export const CONTACT_SHEETS: { file: string; pitch: number }[] = [
  { file: "contact-sheet-full.png", pitch: 14 },
  { file: "contact-sheet-phone.png", pitch: 9 },
];
export const CONTACT_DIR = new URL("../../docs/art/v2/", import.meta.url);

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const out = new URL("../../dist/", import.meta.url);
  mkdirSync(fileURLToPath(out), { recursive: true });
  writeFileSync(new URL("art-sheet.html", out), sheetHtml(pieces));
  console.log(`→ ${fileURLToPath(new URL("art-sheet.html", out))}`);
  if (process.argv.includes("--png")) {
    mkdirSync(fileURLToPath(CONTACT_DIR), { recursive: true });
    for (const { file, pitch } of CONTACT_SHEETS) {
      writeFileSync(new URL(file, CONTACT_DIR), PNG.sync.write(contactSheetPng(pieces, pitch)));
      console.log(`→ docs/art/v2/${file}`);
    }
  }
}
