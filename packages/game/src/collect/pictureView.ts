import { hexToNumber } from "../theme";

/** The slice of a Phaser Graphics the picture needs (so the maths is testable without Phaser). */
export interface PicturePainter {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
}

/** What a picture needs from a level: its size, family colours, optional shades. */
export interface PictureSource {
  width: number;
  height: number;
  palette: readonly string[];
  cells: readonly number[];
  shades?: { colors: readonly string[]; cells: readonly number[] };
}

/** The colour of cell `i` as a number: its shade when it has one, else its family colour. */
export function cellColor(src: PictureSource, i: number): number | null {
  const family = src.cells[i];
  if (family === undefined || family < 0) return null;
  const shade = src.shades?.cells[i];
  const hex = shade !== undefined && shade >= 0 ? src.shades!.colors[shade] : src.palette[family];
  return hex === undefined ? null : hexToNumber(hex);
}

/** Largest whole-pixel cube size that fits the picture in `maxW`×`maxH` (at least 1). */
export function fitCell(src: PictureSource, maxW: number, maxH: number): number {
  return Math.max(1, Math.floor(Math.min(maxW / src.width, maxH / src.height)));
}

/**
 * Paints the finished picture with its top-left at (x0, y0), one `cell` px per cube and a thin gap
 * like the board. `alphaOf(i)` can fade cells in (a reveal); omit it for a solid picture.
 */
export function paintPicture(
  g: PicturePainter,
  src: PictureSource,
  x0: number,
  y0: number,
  cell: number,
  alphaOf?: (i: number) => number,
): void {
  const gap = cell >= 6 ? Math.max(1, Math.floor(cell / 12)) : 0;
  for (let i = 0; i < src.cells.length; i++) {
    const color = cellColor(src, i);
    if (color === null) continue;
    const alpha = alphaOf ? alphaOf(i) : 1;
    if (alpha <= 0) continue;
    g.fillStyle(color, alpha);
    g.fillRect(
      x0 + (i % src.width) * cell,
      y0 + Math.floor(i / src.width) * cell,
      cell - gap,
      cell - gap,
    );
  }
}

/** Dim silhouette of a picture (for an entry not yet collected): a promise, not a lock. */
export function paintSilhouette(
  g: PicturePainter,
  src: PictureSource,
  x0: number,
  y0: number,
  cell: number,
  color = 0x2a1650,
): void {
  const gap = cell >= 6 ? Math.max(1, Math.floor(cell / 12)) : 0;
  g.fillStyle(color, 1);
  for (let i = 0; i < src.cells.length; i++) {
    if (src.cells[i]! < 0) continue;
    g.fillRect(
      x0 + (i % src.width) * cell,
      y0 + Math.floor(i / src.width) * cell,
      cell - gap,
      cell - gap,
    );
  }
}
