import type { CollectLayout } from "./collectLayout";

/**
 * Where each kind of group badge sits and how big its number is (M14.1). Pure and free of Phaser, so
 * the sizes the player actually reads are tested for every screen in the device matrix.
 */

export type Place = "column" | "field" | "slot";

export interface BadgeBox {
  /** Centre, in device pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The deepest queued box that is drawn: 0 is the front, so a column shows depth 0..2 (three boxes). */
export const PEEK = 2;

/**
 * Every group box is one square (`layout.tile`), so a column's boxes, a waiting group and a working
 * group look the same and the eye reads colour and number only. A column shows its next
 * `COLUMN_VISIBLE` boxes as a real grid (a gap between boxes, the front box at the top); `rect` is the
 * column's current place (columns re-centre as they run out, `activeColumnRects`).
 */
export function badgeBox(
  layout: CollectLayout,
  place: Place,
  index: number,
  depth: number,
  rect?: { x: number; w: number },
): BadgeBox {
  const l = layout;
  const t = l.tile;
  if (place === "field") {
    const r = l.field[index] ?? l.field[l.field.length - 1]!;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: t, h: t };
  }
  if (place === "slot") {
    const r = l.slots[index] ?? l.slots[0]!;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: t, h: t };
  }
  const r = l.columns[index]!;
  const cx = rect ? rect.x + rect.w / 2 : r.x + r.w / 2;
  return { x: cx, y: r.y + l.gap + t / 2 + depth * (t + l.gap), w: t, h: t };
}

/** Widest a bold digit gets, in ems (a little over the usual 0.6). */
export const DIGIT_EM = 0.64;

/**
 * The number's place and size in a box, in device pixels from the box centre: centred and large, sized
 * so even a three-digit number clears the edges.
 */
export function numberLayout(w: number, h: number): { x: number; y: number; fontPx: number } {
  const widest = (w * 0.86) / (3 * DIGIT_EM);
  return { x: 0, y: 0, fontPx: Math.round(Math.min(h * 0.5, widest)) };
}

/** The number's font size in device pixels. */
export const badgeFontPx = (w: number, h: number): number => numberLayout(w, h).fontPx;
