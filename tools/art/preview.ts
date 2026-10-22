/**
 * Writes dist/art-preview.html: every shipped level's artwork with its stats, for reviewing
 * content and the difficulty curve at a glance.
 *
 *   npm run art:preview
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BuiltWorld } from "@hexhue/core";
import { worlds } from "../../content/worlds";
import { OUTPUT_DIR } from "../levels/format";
import { artProblems } from "./check";

const built = worlds.map(
  (w) => JSON.parse(readFileSync(new URL(`${w.id}.json`, OUTPUT_DIR), "utf8")) as BuiltWorld,
);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const cards = built
  .map((world) => {
    const levels = world.levels
      .map((b, i) => {
        const l = b.level;
        const cell = Math.max(4, Math.floor(160 / Math.max(l.width, l.height)));
        const rects = l.cells
          .map((c, k) =>
            c < 0
              ? ""
              : `<rect x="${(k % l.width) * cell}" y="${Math.floor(k / l.width) * cell}" width="${cell - 1}" height="${cell - 1}" rx="${cell / 5}" fill="${l.palette[c]}"/>`,
          )
          .join("");
        const wisps = l.columns.reduce((n, c) => n + c.length, 0);
        const problems = artProblems(l);
        return `<figure>
  <svg width="${l.width * cell}" height="${l.height * cell}">${rects}</svg>
  <figcaption><b>${i + 1}. ${esc(l.name)}</b> <small>${l.width}×${l.height} · ${l.palette.length} colors</small><br>
  difficulty <b>${b.difficulty}</b> · ${wisps} wisps · ${l.columns.length} cols · ${l.slots} slots · min ${b.minSlots}<br>
  <i>${esc(b.lore)}</i>${problems.map((p) => `<br><span class="warn">⚠ ${esc(p)}</span>`).join("")}</figcaption>
</figure>`;
      })
      .join("\n");
    const curve = world.levels.map((b) => b.difficulty);
    const spark = curve
      .map((d, i) => `${(i / Math.max(1, curve.length - 1)) * 300},${60 - d * 60}`)
      .join(" ");
    return `<section><h2>${esc(world.name)}</h2>
<svg class="curve" width="300" height="60"><polyline points="${spark}" fill="none" stroke="#f6d97a" stroke-width="2"/></svg>
<div class="grid">${levels}</div></section>`;
  })
  .join("\n");

const html = `<!doctype html><meta charset="utf-8"><title>Hex & Hue art preview</title>
<style>
body{background:#140b2e;color:#f5efff;font:14px system-ui;margin:24px}
.grid{display:flex;flex-wrap:wrap;gap:20px}
figure{margin:0;background:#0f0824;padding:12px;border-radius:12px;width:200px}
figcaption{margin-top:8px;line-height:1.5}
small,i{color:#b9a9e6}.warn{color:#ff8fa3}.curve{background:#0f0824;border-radius:8px}
</style><h1>Hex & Hue art preview</h1>${cards}`;

const out = new URL("../../dist/", import.meta.url);
mkdirSync(fileURLToPath(out), { recursive: true });
writeFileSync(new URL("art-preview.html", out), html);
console.log(`→ ${fileURLToPath(new URL("art-preview.html", out))}`);
