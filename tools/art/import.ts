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
import { quantize, toAsciiSource } from "./quantize";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : Number(args[i + 1]);
};
const [file, name = "art"] = args.filter(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);
if (!file) {
  console.error("usage: npm run art:import -- <file.png> <name> [--max-colors N] [--block N]");
  process.exit(1);
}

const png = PNG.sync.read(readFileSync(file));
const art = quantize(new Uint8Array(png.data), png.width, png.height, {
  maxColors: flag("max-colors") ?? 8,
  block: flag("block") ?? 0,
});
console.log(toAsciiSource(name, art));
console.error(`${art.width}×${art.height}, ${art.palette.length} colors`);
for (const p of artProblems(art)) console.error(`⚠ ${p}`);
