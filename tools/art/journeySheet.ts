import { mkdirSync, writeFileSync } from "node:fs";
import type * as collect from "@hexhue/core/collect";
import { JOURNEY } from "../../packages/game/src/collect/journey";

/**
 * The journey's art sheet (M15.13): every journey picture as the board plays it (cubes on the light
 * board), at phone size, with its chapter, tier, size, colours and lore, for the owner's review.
 *
 *   npm run art:journey          # → dist/journey-sheet.html
 *   npm run art:journey -- out.html
 */

const CUBE = 9;

function board(level: collect.CollectLevel): string {
  const { width, height, cells, palette } = level;
  const rects: string[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const c = cells[y * width + x]!;
      if (c < 0) continue;
      rects.push(
        `<rect x="${x * CUBE + 0.5}" y="${y * CUBE + 0.5}" width="${CUBE - 1}" height="${CUBE - 1}" rx="1.6" fill="${palette[c]}"/>`,
      );
    }
  return `<svg viewBox="0 0 ${width * CUBE} ${height * CUBE}" width="${width * CUBE}" height="${height * CUBE}">${rects.join("")}</svg>`;
}

export function sheet(): string {
  const cards = JOURNEY.map((e, i) => {
    const l = e.make();
    const cubes = l.cells.filter((c) => c >= 0).length;
    return `<figure><div class="art">${board(l)}</div><figcaption><b>${i + 1}. ${l.name}</b>
      <span class="tier ${e.tier}">${e.tier}</span><br><small>Chapter ${e.chapter}: ${e.chapterName} · ${l.width}×${l.height} · ${cubes} cubes · ${l.palette.length} colours</small>
      <p>${l.subject?.lore ?? ""}</p></figcaption></figure>`;
  });
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Journey art sheet</title><style>
body{margin:0;padding:16px;background:#ebbf91;font:14px system-ui,sans-serif;color:#3b1d0b}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
figure{margin:0;background:#faf4ecaa;border-radius:12px;padding:12px}
.art{display:flex;justify-content:center;padding:8px}
.tier{font-size:11px;font-weight:700;color:#fff;border-radius:6px;padding:1px 6px;margin-left:6px;text-transform:uppercase}
.easy{background:#1f9e4a}.medium{background:#2a6cf0}.hard{background:#8a3fd6}.extreme{background:#d2342b}
p{margin:6px 0 0;font-style:italic}</style><h1>Hex &amp; Hue: the witch's journey</h1><main>${cards.join("")}</main>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ?? "dist/journey-sheet.html";
  mkdirSync(out.replace(/[^/]*$/, "") || ".", { recursive: true });
  writeFileSync(out, sheet());
  console.log(`→ ${out}`);
}
