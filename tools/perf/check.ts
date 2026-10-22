/**
 * Checks the production build against the performance budget; exits non-zero when over.
 *   npm run budget   (after npm run build)
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { CONTENT_SCRIPT_MAX, checkBudgets, scriptLeaks, type BuiltFile } from "./budget";

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

const files: BuiltFile[] = paths.map((p) => {
  const data = readFileSync(p);
  return {
    path: relative(root, p).split(sep).join("/"),
    bytes: data.length,
    gzip: gzipSync(data, { level: 9 }).length,
  };
});

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
const leaks = scriptLeaks(
  files
    .filter((f) => f.path.endsWith(".html"))
    .map((f) => ({ path: f.path, html: readFileSync(join(root, f.path), "utf8") })),
  bundles,
);
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
