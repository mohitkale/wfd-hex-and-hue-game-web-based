import { hexToNumber } from "../theme";

/** A cube's three tones: base, a lighter top-left edge and a darker bottom-right edge. */
export interface CubeTones {
  base: number;
  light: number;
  dark: number;
}

const mixChannel = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

function mix(color: number, target: number, t: number): number {
  const r = mixChannel((color >> 16) & 255, (target >> 16) & 255, t);
  const g = mixChannel((color >> 8) & 255, (target >> 8) & 255, t);
  const b = mixChannel(color & 255, target & 255, t);
  return (r << 16) | (g << 8) | b;
}

export function tonesFor(hex: string, bevel = 0.38): CubeTones {
  const base = hexToNumber(hex);
  return { base, light: mix(base, 0xffffff, bevel), dark: mix(base, 0x140b2e, bevel) };
}

/** A gentler bevel for shaded art, so the cube edge does not blur the steps of a shading ramp. */
export const SHADED_BEVEL = 0.2;

/**
 * Per padded-grid cell tones for a level with shades (ART_DIRECTION_V2 §1), or null when the level
 * has none. The padded grid is `(width + 2)` wide (a one-cell ring), the same layout the board uses.
 */
export function shadeTonesGrid(level: {
  width: number;
  height: number;
  shades?: { colors: string[]; cells: number[] };
}): (CubeTones | undefined)[] | null {
  const { shades, width, height } = level;
  if (!shades) return null;
  const tones = shades.colors.map((hex) => tonesFor(hex, SHADED_BEVEL));
  const stride = width + 2;
  const grid = new Array<CubeTones | undefined>(stride * (height + 2)).fill(undefined);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const shade = shades.cells[y * width + x]!;
      if (shade >= 0) grid[(y + 1) * stride + (x + 1)] = tones[shade];
    }
  }
  return grid;
}

/** Minimal drawing surface (a Phaser Graphics satisfies it), so the maths can be tested. */
export interface RectPainter {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
}

/** What a rounded cube tile needs (a Phaser Graphics satisfies it too). */
export interface TilePainter extends RectPainter {
  fillRoundedRect(x: number, y: number, w: number, h: number, radius: number): unknown;
}

/**
 * A wax seal over a cube (M13.4): a dark veil, then a small square in the key colour with a pale
 * rim, so the player can see which colour opens it. Painted on top of the cube, never instead of it.
 */
export function paintSeal(
  g: RectPainter,
  x: number,
  y: number,
  size: number,
  key: CubeTones,
): void {
  g.fillStyle(0x140b2e, 0.5);
  g.fillRect(x, y, size, size);
  const dot = Math.max(2, Math.round(size * 0.42));
  const o = Math.floor((size - dot) / 2);
  g.fillStyle(0xfff6d8, 0.95);
  g.fillRect(x + o - 1, y + o - 1, dot + 2, dot + 2);
  g.fillStyle(key.base);
  g.fillRect(x + o, y + o, dot, dot);
  g.fillStyle(key.light);
  g.fillRect(x + o, y + o, Math.max(1, Math.floor(dot / 2)), 1);
}

/**
 * Paints one cube of `size` px with its top-left corner at (x, y) as a glossy rounded tile (v2.0.0
 * look): a darker lip along the bottom gives it body, the face is the cube's colour, and a soft
 * highlight with a small bright dot sits in the upper left, like a candy or a polished stone.
 */
export function paintCube(g: TilePainter, x: number, y: number, size: number, t: CubeTones): void {
  const r = Math.max(2, size * 0.3);
  const lip = Math.max(1, Math.round(size * 0.1));
  g.fillStyle(t.dark);
  g.fillRoundedRect(x, y + lip, size, size - lip, r);
  g.fillStyle(t.base);
  g.fillRoundedRect(x, y, size, size - lip, r);
  g.fillStyle(t.light, 0.5);
  g.fillRoundedRect(x + size * 0.14, y + size * 0.1, size * 0.58, size * 0.22, size * 0.11);
  g.fillStyle(0xffffff, 0.55);
  g.fillRoundedRect(x + size * 0.18, y + size * 0.15, size * 0.14, size * 0.12, size * 0.06);
}
