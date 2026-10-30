import type * as collect from "@hexhue/core/collect";

/**
 * The drawing grid the pictures are designed on (M15.13): simple shapes (discs, rings, polygons,
 * sparkles), one-cell outlines round and between colour regions (the bordered, sticker-like look the
 * owner asked for) and a 3×5 pixel font for words. Every cell is one cube; `null` is empty. Pure and
 * deterministic.
 */

export type Colour = string;

/** 3×5 glyphs, rows top to bottom, `#` filled. */
const FONT: Record<string, readonly string[]> = {
  A: ["###", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: ["###", "#..", "#..", "#..", "###"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  G: ["###", "#..", "#.#", "#.#", "###"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", "###"],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#.#", "###", "###", "#.#", "#.#"],
  N: ["##.", "#.#", "#.#", "#.#", "#.#"],
  O: ["###", "#.#", "#.#", "#.#", "###"],
  P: ["###", "#.#", "###", "#..", "#.."],
  Q: ["###", "#.#", "#.#", "###", "..#"],
  R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: ["###", "#..", "###", "..#", "###"],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  U: ["#.#", "#.#", "#.#", "#.#", "###"],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."],
  W: ["#.#", "#.#", "###", "###", "#.#"],
  X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", "###", ".#.", ".#."],
  Z: ["###", "..#", ".#.", "#..", "###"],
  "!": [".#.", ".#.", ".#.", "...", ".#."],
  "'": [".#.", ".#.", "...", "...", "..."],
  ".": ["...", "...", "...", "...", ".#."],
  " ": ["...", "...", "...", "...", "..."],
};
export const GLYPH_W = 3;
export const GLYPH_H = 5;

/** Width in cells of `text` in the pixel font (a cell between letters, two between words). */
export function textWidth(text: string): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) w += (text[i] === " " ? 2 : GLYPH_W) + (i > 0 ? 1 : 0);
  return w;
}

export class Canvas {
  readonly cells: (Colour | null)[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = new Array<Colour | null>(w * h).fill(null);
  }
  set(x: number, y: number, c: Colour | null): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = c;
  }
  get(x: number, y: number): Colour | null {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.cells[y * this.w + x]! : null;
  }
  /** Every cell whose centre lies inside the ellipse (cx, cy, rx, ry). */
  disc(cx: number, cy: number, rx: number, c: Colour | null, ry = rx): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
  }
  /** The cells between radius `r - width` and `r` round (cx, cy). */
  ring(cx: number, cy: number, r: number, width: number, c: Colour): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r && d > r - width) this.set(x, y, c);
      }
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: Colour | null): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  /** Every cell whose centre is inside the polygon. */
  poly(pts: readonly (readonly [number, number])[], c: Colour | null): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i]!;
          const [xj, yj] = pts[j]!;
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
            inside = !inside;
        }
        if (inside) this.set(x, y, c);
      }
  }
  /** A straight line of cells from (x0, y0) to (x1, y1). */
  line(x0: number, y0: number, x1: number, y1: number, c: Colour): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++)
      this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
  }
  /** A small four-point sparkle centred on (x, y). */
  star(x: number, y: number, c: Colour, arm = 1): void {
    for (let i = -arm; i <= arm; i++) {
      this.set(x + i, y, c);
      this.set(x, y + i, c);
    }
  }
  /** A five-point star of outer radius `r` round (cx, cy). */
  star5(cx: number, cy: number, r: number, c: Colour): void {
    const pts: [number, number][] = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 === 0 ? r : r * 0.45;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    this.poly(pts, c);
  }
  /** Paints `c` over every filled cell for which `keep(x, y, was)` holds. */
  recolour(c: Colour, keep: (x: number, y: number, was: Colour) => boolean): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const was = this.get(x, y);
        if (was !== null && keep(x, y, was)) this.set(x, y, c);
      }
  }
  /** Fills every empty cell with `c(x, y)` (a background: sky, stars, a checked floor). */
  fillEmpty(c: (x: number, y: number) => Colour): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (this.get(x, y) === null) this.set(x, y, c(x, y));
  }
  /** `text` in the pixel font with its top-left at (x, y); returns its width. */
  text(x: number, y: number, text: string, c: Colour): number {
    let cx = x;
    for (const ch of text.toUpperCase()) {
      const glyph = FONT[ch] ?? FONT[" "]!;
      const w = ch === " " ? 2 : GLYPH_W;
      if (ch !== " ")
        glyph.forEach((row, gy) => {
          for (let gx = 0; gx < GLYPH_W; gx++) if (row[gx] === "#") this.set(cx + gx, y + gy, c);
        });
      cx += w + 1;
    }
    return cx - x - 1;
  }
  /** `text` centred on column `cx`. */
  textCentred(cx: number, y: number, text: string, c: Colour): void {
    this.text(Math.round(cx - textWidth(text) / 2), y, text, c);
  }
  /**
   * The bordered look: a one-cell line of `c` round shapes and between colours.
   * - `outside`: empty cells touching the drawing become `c` (the silhouette grows by a cell).
   * - `between`: where two colours meet, the cells of one side only become `c` (the colour that
   *   sorts later), so the line is one cell thick.
   * - `around`: only the shapes of these colours are outlined, from the outside (for a light line
   *   round a dark shape on a dark sky, say).
   * - `keep`: colours never turned into the line, and never outlined against (eyes, sparkles,
   *   letters, a flame's glow).
   * - `families`: shades of one colour (purple and light purple, say) are not separated by a line,
   *   so shading reads as shading.
   */
  outline(
    c: Colour,
    o: {
      outside?: boolean;
      between?: boolean;
      around?: readonly Colour[];
      keep?: readonly Colour[];
      families?: readonly (readonly Colour[])[];
    } = {},
  ): void {
    const { outside = true, between = true, around, keep = [], families = [] } = o;
    const family = (a: Colour) => families.findIndex((f) => f.includes(a));
    const kin = (a: Colour, b: Colour) => family(a) >= 0 && family(a) === family(b);
    const marks: number[] = [];
    const n4 = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    const target = (q: Colour | null): q is Colour =>
      q !== null && q !== c && !keep.includes(q) && (!around || around.includes(q));
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const p = this.get(x, y);
        if (p === c || (p !== null && keep.includes(p))) continue;
        if (p === null ? !outside : !between) continue;
        if (p !== null && around?.includes(p)) continue;
        for (const [dx, dy] of n4) {
          const q = this.get(x + dx, y + dy);
          if (!target(q) || q === p || (p !== null && kin(p, q))) continue;
          if (p === null || around || p > q) {
            marks.push(y * this.w + x);
            break;
          }
        }
      }
    for (const i of marks) this.cells[i] = c;
  }
}

/**
 * A picture as a level: one box per colour to start (the board maker deals the real boxes). The
 * board keeps the picture as drawn, its subject (name and lore for the win and the Spellbook) and its
 * shades (so the reveal shows exactly the colours played).
 */
export function asLevel(
  id: string,
  g: Canvas,
  subject: collect.LevelSubject,
): collect.CollectLevel {
  const palette = [...new Set(g.cells.filter((c): c is Colour => c !== null))];
  const cells = g.cells.map((c) => (c === null ? -1 : palette.indexOf(c)));
  const columns = palette.map((_, color) => [
    { color, capacity: cells.filter((c) => c === color).length },
  ]);
  return {
    id,
    name: subject.name,
    width: g.w,
    height: g.h,
    palette,
    cells,
    columns: [columns.flat()],
    slots: 3,
    squad: 3,
    spawnGap: 2,
    fieldCap: 3,
    subject,
  };
}
