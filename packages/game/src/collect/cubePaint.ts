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

export function tonesFor(hex: string): CubeTones {
  const base = hexToNumber(hex);
  return { base, light: mix(base, 0xffffff, 0.38), dark: mix(base, 0x140b2e, 0.38) };
}

/** Minimal drawing surface (a Phaser Graphics satisfies it), so the maths can be tested. */
export interface RectPainter {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
}

/** Paints one cube of `size` px with its top-left corner at (x, y). */
export function paintCube(g: RectPainter, x: number, y: number, size: number, t: CubeTones): void {
  const edge = Math.max(1, Math.floor(size / 6));
  g.fillStyle(t.base);
  g.fillRect(x, y, size, size);
  g.fillStyle(t.light);
  g.fillRect(x, y, size, edge);
  g.fillRect(x, y, edge, size);
  g.fillStyle(t.dark);
  g.fillRect(x, y + size - edge, size, edge);
  g.fillRect(x + size - edge, y, edge, size);
}
