/**
 * Converts a pixel-art PNG into an AsciiArt snippet for content/art/*.ts.
 *
 *   npm run art:import -- path/to/owl.png owl [--max-colors 6] [--block 8]
 *
 * Transparent pixels become empty cells. Upscaled art is detected automatically (or pass --block).
 * Prints the snippet plus any readability problems (colors too dark or too similar).
 */
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { artProblems } from "./check";
import { MAX_IMPORT_COLORS, quantize, toAsciiSource } from "./quantize";

const USAGE = `usage: npm run art:import -- <file.png> <name> [--max-colors 1..${MAX_IMPORT_COLORS}] [--block N]`;
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
for (const k of flags.keys())
  if (k !== "max-colors" && k !== "block") fail(`unknown option --${k}`);

const [file, name = "art"] = positional;
if (!file) fail("missing PNG file");
if (!/^[A-Za-z_$][\w$]*$/.test(name)) fail(`"${name}" is not a valid identifier`);

try {
  const png = PNG.sync.read(readFileSync(file!));
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
