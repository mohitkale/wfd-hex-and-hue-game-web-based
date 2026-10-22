/**
 * Build-time PNGs for the website: each mosaic's artwork (gallery, blog, share cards) and the
 * site's social share image. Drawn from the shipped level data, like the game draws them.
 */
import { PNG } from "pngjs";
import { textPixels } from "./pixelFont";

export interface ArtLike {
  width: number;
  height: number;
  palette: readonly string[];
  /** Palette index per cell; negative = empty. */
  cells: readonly number[];
}

type Rgba = [number, number, number, number];

const NIGHT: Rgba = [0x14, 0x0b, 0x2e, 255];
const GOLD: Rgba = [0xf6, 0xd9, 0x7a, 255];
const MIST: Rgba = [0xc9, 0xb8, 0xff, 255];

export function hexToRgba(hex: string): Rgba {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

class Canvas {
  readonly png: PNG;
  constructor(
    readonly width: number,
    readonly height: number,
    fill: Rgba | null,
  ) {
    this.png = new PNG({ width, height });
    if (fill) this.rect(0, 0, width, height, fill);
  }

  rect(x0: number, y0: number, w: number, h: number, c: Rgba): void {
    const x1 = Math.min(this.width, Math.round(x0 + w));
    const y1 = Math.min(this.height, Math.round(y0 + h));
    for (let y = Math.max(0, Math.round(y0)); y < y1; y++) {
      for (let x = Math.max(0, Math.round(x0)); x < x1; x++) {
        const i = (y * this.width + x) * 4;
        this.png.data[i] = c[0];
        this.png.data[i + 1] = c[1];
        this.png.data[i + 2] = c[2];
        this.png.data[i + 3] = c[3];
      }
    }
  }

  /** Mosaic tiles: each cell a square with a small gap, like the game board. */
  art(art: ArtLike, x0: number, y0: number, cell: number): void {
    const gap = Math.max(1, Math.round(cell * 0.08));
    const colors = art.palette.map(hexToRgba);
    art.cells.forEach((c, i) => {
      if (c < 0) return;
      const x = x0 + (i % art.width) * cell;
      const y = y0 + Math.floor(i / art.width) * cell;
      this.rect(x + gap / 2, y + gap / 2, cell - gap, cell - gap, colors[c]!);
    });
  }

  text(value: string, cx: number, y: number, unit: number, color: Rgba): void {
    const { pixels, width } = textPixels(value);
    const x0 = Math.round(cx - (width * unit) / 2);
    for (const [px, py] of pixels) this.rect(x0 + px * unit, y + py * unit, unit, unit, color);
  }

  encode(): Buffer {
    return PNG.sync.write(this.png);
  }
}

/** An artwork as a crisp PNG, `cell` px per tile, on a transparent background. */
export function artPng(art: ArtLike, cell = 16): Buffer {
  const canvas = new Canvas(art.width * cell, art.height * cell, null);
  canvas.art(art, 0, 0, cell);
  return canvas.encode();
}

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/**
 * The social share image: a row of mosaics under the title, in the game's pixel style. Pass the
 * artworks to show (3–5 look best).
 */
export function ogPng(arts: readonly ArtLike[], tagline = "A little magic in every color"): Buffer {
  const canvas = new Canvas(OG_WIDTH, OG_HEIGHT, NIGHT);
  // A few fixed "stars" so the sky isn't flat.
  for (let i = 0; i < 70; i++) {
    const x = (i * 467) % OG_WIDTH;
    const y = (i * 263) % OG_HEIGHT;
    canvas.rect(x, y, 3, 3, i % 5 === 0 ? GOLD : [0xff, 0xff, 0xff, 140]);
  }
  canvas.text("HEX & HUE", OG_WIDTH / 2, 70, 14, GOLD);
  canvas.text(tagline, OG_WIDTH / 2, 190, 5, MIST);
  const box = 220;
  const gap = 36;
  const shown = arts.slice(0, 4);
  const total = shown.length * box + (shown.length - 1) * gap;
  shown.forEach((art, i) => {
    const cell = Math.floor(box / Math.max(art.width, art.height));
    const x = (OG_WIDTH - total) / 2 + i * (box + gap) + (box - cell * art.width) / 2;
    const y = 300 + (box - cell * art.height) / 2;
    canvas.art(art, x, y, cell);
  });
  canvas.text("FREE MAGICAL PIXEL PUZZLE", OG_WIDTH / 2, 560, 4, MIST);
  return canvas.encode();
}
