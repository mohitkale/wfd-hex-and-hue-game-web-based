import { contrast, hexToNumber, luminance } from "../theme";

/** A cube's three tones: base, a lighter top-left edge and a darker bottom-right edge. */
export interface CubeTones {
  base: number;
  light: number;
  dark: number;
}

const mixChannel = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

/** `color` moved a share `t` of the way toward `target`, channel by channel. */
export const mixTone = (color: number, target: number, t: number): number => mix(color, target, t);

function mix(color: number, target: number, t: number): number {
  const r = mixChannel((color >> 16) & 255, (target >> 16) & 255, t);
  const g = mixChannel((color >> 8) & 255, (target >> 8) & 255, t);
  const b = mixChannel(color & 255, target & 255, t);
  return (r << 16) | (g << 8) | b;
}

export function tonesFor(hex: string, bevel = 0.38): CubeTones {
  const base = hexToNumber(hex);
  // Shades stay in the colour's own hue (owner feedback: mixing toward the night purple made every
  // colour look dull): the dark tone is the colour toward black, the light one toward white. The dark
  // tone carries the white box numbers: on a light colour (yellow) it is taken deeper until white on
  // it reaches 3.5:1.
  let dark = mix(base, 0x000000, bevel * 0.7);
  for (let t = bevel * 0.7; t < 0.9 && contrast(1, luminance(hexOf(dark))) < 3.5; t += 0.04)
    dark = mix(base, 0x000000, t);
  return { base, light: mix(base, 0xffffff, bevel + 0.04), dark };
}

const hexOf = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;

/** A gentler bevel for shaded art, so the cube edge does not blur the steps of a shading ramp. */
export const SHADED_BEVEL = 0.2;

/**
 * Per padded-grid cell tones for a level with shades (ART_DIRECTION_V2 §1), or null when the level
 * has none. The padded grid is `(width + 2)` wide (a one-cell ring), the same layout the board uses.
 */
export function shadeTonesGrid(
  level: {
    width: number;
    height: number;
    shades?: { colors: string[]; cells: number[] };
  },
  bevel = SHADED_BEVEL,
): (CubeTones | undefined)[] | null {
  const { shades, width, height } = level;
  if (!shades) return null;
  const tones = shades.colors.map((hex) => tonesFor(hex, bevel));
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
  g: TilePainter,
  x: number,
  y: number,
  size: number,
  key: CubeTones,
): void {
  // Same corner radius as the cube under it, so the veil never tints the gap or the panel.
  g.fillStyle(0x140b2e, 0.5);
  g.fillRoundedRect(x, y, size, size, Math.max(2, size * 0.3));
  const dot = Math.max(2, Math.round(size * 0.42));
  const o = Math.floor((size - dot) / 2);
  g.fillStyle(0xfff6d8, 0.95);
  g.fillRoundedRect(x + o - 1, y + o - 1, dot + 2, dot + 2, (dot + 2) * 0.32);
  g.fillStyle(key.base);
  g.fillRoundedRect(x + o, y + o, dot, dot, dot * 0.3);
  g.fillStyle(key.light, 0.8);
  g.fillRoundedRect(x + o + dot * 0.18, y + o + dot * 0.14, dot * 0.34, dot * 0.2, dot * 0.1);
}

/** How far a cube's edge goes from its face colour toward its dark tone (0 = none, 1 = the dark tone). */
export const CUBE_EDGE_DARKNESS = 0.6;

/**
 * Paints one cube of `size` px with its top-left corner at (x, y) as a square block (M15.13): the
 * colour's face, a thin darker edge along the bottom and right that tells neighbouring cubes apart
 * without a gap, and a faint lighter band along the top. Square, so the picture has no holes between
 * cubes.
 */
export function paintCube(g: TilePainter, x: number, y: number, size: number, t: CubeTones): void {
  // The top face of a 3D block (its depth, the front face, is drawn by the board where the cell below
  // is open): square, a thin line where faces meet, a lit top and left edge, a slightly shaded bottom.
  const line = Math.max(1, Math.round(size * 0.07));
  g.fillStyle(mix(t.base, t.dark, CUBE_EDGE_DARKNESS));
  g.fillRect(x, y, size, size);
  const s = size - line;
  g.fillStyle(t.base);
  g.fillRect(x, y, s, s);
  const lip = Math.max(1, Math.round(s * 0.18));
  g.fillStyle(t.light, 0.8);
  g.fillRect(x, y, s, lip);
  g.fillStyle(t.light, 0.4);
  g.fillRect(x, y + lip, Math.max(1, Math.round(s * 0.12)), s - lip);
  g.fillStyle(t.dark, 0.18);
  g.fillRect(x, y + s - lip, s, lip);
}
