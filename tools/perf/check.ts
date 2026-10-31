/**
 * Checks the production build against the performance budget; exits non-zero when over.
 *   npm run budget   (after npm run build)
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  CONTENT_SCRIPT_MAX,
  checkBudgets,
  inlineScripts,
  pageScripts,
  scriptClosure,
  scriptLeaks,
  type BuiltFile,
} from "./budget";

const root = fileURLToPath(new URL("../../apps/web/dist/", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

let paths: string[];
try {
  paths = walk(root);
} catch {
  console.error("No build found at apps/web/dist: run `npm run build` first.");
  process.exit(1);
}

const built: BuiltFile[] = paths.map((p) => {
  const data = readFileSync(p);
  return {
    path: relative(root, p).split(sep).join("/"),
    bytes: data.length,
    gzip: gzipSync(data, { level: 9 }).length,
  };
});
// The game's scripts: what /play loads, and everything that can load later, dynamic imports too.
const read = (path: string) => readFileSync(join(root, path), "utf8");
let playPage: string;
try {
  playPage = read("play/index.html");
} catch {
  console.error("No play page in the build (apps/web/dist/play/index.html).");
  process.exit(1);
}
const playable = new Set(scriptClosure(pageScripts(playPage), read, true));
// The game's largest script (Phaser and the board) must be among those counted, or the import
// scan has missed a way the game loads code and the budget would undercount.
const largest = built
  .filter((f) => f.path.startsWith("_astro/") && f.path.endsWith(".js"))
  .sort((a, b) => b.gzip - a.gzip)[0];
if (largest && !playable.has(largest.path)) {
  console.error(`✗ the largest script, ${largest.path}, is not reached from /play: check the scan`);
  process.exit(1);
}
const files = built.map((f) =>
  f.path.startsWith("_astro/") && f.path.endsWith(".js") ? { ...f, play: playable.has(f.path) } : f,
);

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
let failed = false;
for (const r of checkBudgets(files)) {
  failed ||= !r.ok;
  const where = r.file ? ` (${r.file})` : "";
  console.log(`${r.ok ? "✓" : "✗"} ${r.label}: ${kb(r.value)} / ${kb(r.max)}${where}`);
}
const bundles = new Map(
  files
    .filter((f) => f.path.startsWith("_astro/") && f.path.endsWith(".js"))
    .map((f) => [f.path, { gzip: f.gzip, code: readFileSync(join(root, f.path), "utf8") }]),
);
const pages = files
  .filter((f) => f.path.endsWith(".html"))
  .map((f) => ({ path: f.path, html: readFileSync(join(root, f.path), "utf8") }));
const leaks = scriptLeaks(pages, bundles);
for (const page of inlineScripts(pages)) {
  console.log(`✗ ${page} has an inline script (the CSP allows script files only)`);
  failed = true;
}
for (const l of leaks) {
  console.log(
    `✗ ${l.page} loads ${kb(l.gzip)} of script (content pages: ${kb(CONTENT_SCRIPT_MAX)})`,
  );
}
failed ||= leaks.length > 0;
if (failed) {
  console.error("Performance budget exceeded.");
  process.exit(1);
}
