/**
 * Converts a pixel-art PNG into an AsciiArt snippet for content/art/*.ts.
 *
 *   npm run art:import -- path/to/owl.png owl [--max-colors 6] [--block 8]
 *
 * Transparent pixels become empty cells. Upscaled art is detected automatically (or pass --block).
 * Prints the snippet plus any readability problems (colors too dark or too similar).
 *
 * Production art (docs/ART_DIRECTION_V2.md): add `--families` to snap colours to the house families
 * and print a v2 piece for content/v2art plus the art-rule report:
 *
 *   npm run art:import -- art.png candle --families --author "Name" [--max-families 6] [--max-error 45]
 */
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { artProblems } from "./check";
import { importFamilies, toPieceSource } from "./importFamilies";
import { checkPiece } from "./rules";
import { MAX_IMPORT_COLORS, quantize, toAsciiSource } from "./quantize";

const USAGE = `usage: npm run art:import -- <file.png> <name> [--max-colors 1..${MAX_IMPORT_COLORS}] [--block N]\n       npm run art:import -- <file.png> <kebab-id> --families --author "Name" [--max-families 1..8] [--max-error 1..400] [--block N]`;
const fail = (msg: string): never => {
  console.error(`${msg}\n${USAGE}`);
  process.exit(1);
};

const positional: string[] = [];
const flags = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (!a.startsWith("--")) positional.push(a);
  else if (a.includes("=")) flags.set(a.slice(2, a.indexOf("=")), a.slice(a.indexOf("=") + 1));
  else flags.set(a.slice(2), argv[++i] ?? "");
}
const int = (name: string, fallback: number, min: number, max: number): number => {
  const raw = flags.get(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max)
    fail(`--${name} must be an integer ${min}..${max}`);
  return n;
};
const KNOWN = ["max-colors", "block", "families", "author", "max-families", "max-error"];
for (const k of flags.keys()) if (!KNOWN.includes(k)) fail(`unknown option --${k}`);

const [file, name = "art"] = positional;
if (!file) fail("missing PNG file");
if (!/^[A-Za-z_$][\w$]*$/.test(name)) fail(`"${name}" is not a valid identifier`);

try {
  const png = PNG.sync.read(readFileSync(file!));
  if (flags.has("families")) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) fail(`--families needs a kebab-case id, got "${name}"`);
    const result = importFamilies(new Uint8Array(png.data), png.width, png.height, {
      block: int("block", 0, 0, Math.min(png.width, png.height)),
      maxFamilies: int("max-families", 8, 1, 8),
      maxMeanError: int("max-error", 45, 1, 400),
    });
    const author = flags.get("author")?.trim();
    if (!author) fail('--families needs --author "Name" (who drew it)');
    console.log(toPieceSource(name, result, author));
    console.error(
      `${result.width}×${result.height}, ${Object.keys(result.legend).length} shades; ` +
        `mean error ${result.error.mean}, worst ${result.error.max}`,
    );
    const piece = {
      id: name,
      name: name,
      theme: "other" as const,
      lore: "(lore to be written)",
      rows: result.rows,
      legend: result.legend,
      provenance: {
        author,
        source: "imported-png" as const,
        licence: "original-owner-pending" as const,
        reviewed: false,
      },
    };
    // A report only: a draft may fail rules until it is finished, so this never sets the exit code.
    for (const f of checkPiece(piece).findings)
      if (!f.ok && !f.id.startsWith("PR-"))
        console.error(`${f.severity === "error" ? "✗" : "⚠"} ${f.id}: ${f.measured}`);
    process.exit(0);
  }
  const block = int("block", 0, 0, Math.min(png.width, png.height));
  const art = quantize(new Uint8Array(png.data), png.width, png.height, {
    maxColors: int("max-colors", 8, 1, MAX_IMPORT_COLORS),
    block,
  });
  console.log(toAsciiSource(name, art));
  console.error(`${art.width}×${art.height}, ${art.palette.length} colors`);
  if (art.width > 64 || art.height > 64) {
    console.error("⚠ larger than 64×64: was the block size detected correctly? Try --block N.");
  }
  for (const p of artProblems(art)) console.error(`⚠ ${p}`);
} catch (e) {
  fail((e as Error).message);
}
