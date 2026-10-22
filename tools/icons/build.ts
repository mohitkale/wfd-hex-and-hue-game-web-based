/**
 * Writes the PWA / home-screen icons to apps/web/public/icons (committed; rerun after changing
 * icon.ts):  npm run icons
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { renderIcon } from "./icon";

const outDir = fileURLToPath(new URL("../../apps/web/public/icons/", import.meta.url));
mkdirSync(outDir, { recursive: true });

const icons: [name: string, size: number, maskable: boolean][] = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
];

for (const [name, size, maskable] of icons) {
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.from(renderIcon(size, maskable));
  writeFileSync(outDir + name, PNG.sync.write(png));
  console.log(`wrote icons/${name}`);
}
