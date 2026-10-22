/**
 * The app icon, drawn in code like the rest of Hex & Hue's art: a golden crescent moon made of
 * mosaic tiles on the night sky, with a few lilac star tiles. Rendered at any size as RGBA.
 */
type Rgb = readonly [number, number, number];

const NIGHT: Rgb = [0x14, 0x0b, 0x2e];
const TILE: Rgb = [0x2a, 0x16, 0x50];
const GOLD: Rgb = [0xf6, 0xd9, 0x7a];
const MIST: Rgb = [0xc9, 0xb8, 0xff];

/** Tiles across the moon's art grid. */
const GRID = 16;
const STARS: readonly (readonly [number, number])[] = [
  [12, 3],
  [13, 9],
  [10, 12],
];

/** What fills tile (x, y) of the art grid. */
export function tileColor(x: number, y: number): Rgb {
  if (STARS.some(([sx, sy]) => sx === x && sy === y)) return MIST;
  const c = (GRID - 1) / 2;
  const inMoon = (x - c) ** 2 + (y - c) ** 2 <= 6.3 ** 2;
  const inBite = (x - c - 2.6) ** 2 + (y - c + 1.6) ** 2 <= 5.4 ** 2;
  return inMoon && !inBite ? GOLD : TILE;
}

/**
 * RGBA pixels of a `size`×`size` icon. A maskable icon keeps the art inside the central 80% safe
 * zone (launchers crop it to circles or squircles); a regular one uses nearly the full square.
 */
export function renderIcon(size: number, maskable = false): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const art = maskable ? size * 0.72 : size * 0.86;
  const origin = (size - art) / 2;
  const tile = art / GRID;
  const gap = tile * 0.1;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let color = NIGHT;
      const gx = (px + 0.5 - origin) / tile;
      const gy = (py + 0.5 - origin) / tile;
      if (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID) {
        const fx = (gx % 1) * tile;
        const fy = (gy % 1) * tile;
        const inTile = fx >= gap && fy >= gap && fx < tile - gap && fy < tile - gap;
        if (inTile) color = tileColor(Math.floor(gx), Math.floor(gy));
      }
      const i = (py * size + px) * 4;
      out[i] = color[0];
      out[i + 1] = color[1];
      out[i + 2] = color[2];
      out[i + 3] = 255;
    }
  }
  return out;
}
