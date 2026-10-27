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
  /** A queued group behind the front one: just its number, no creature. */
  mini: boolean;
}

/** How many queued groups are drawn per column (the front one plus peeks behind it). */
export const PEEK = 2;

/** How much of a queued tile shows below the one in front of it, as a share of the tile. */
export const PEEK_SHARE = 0.34;

/**
 * Every group box is one square (`layout.tile`), so a column's front group, a waiting group and a
 * working group look the same and the eye reads colour and number only. A queued group behind the
 * front one is the same square stacked underneath with `PEEK_SHARE` of it showing: its number sits in
 * that strip (`mini`).
 */
export function badgeBox(
  layout: CollectLayout,
  place: Place,
  index: number,
  depth: number,
): BadgeBox {
  const l = layout;
  const t = l.tile;
  if (place === "field") {
    const r = l.field[index] ?? l.field[l.field.length - 1]!;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: t, h: t, mini: false };
  }
  if (place === "slot") {
    const r = l.slots[index] ?? l.slots[0]!;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: t, h: t, mini: false };
  }
  const r = l.columns[index]!;
  return {
    x: r.x + r.w / 2,
    y: r.y + t / 2 + t * PEEK_SHARE * depth + 2,
    w: t,
    h: t,
    mini: depth > 0,
  };
}

/** Widest a bold digit gets, in ems (a little over the usual 0.6). */
export const DIGIT_EM = 0.64;

/**
 * Where the number sits in a box and how big it is, in device pixels from the box centre: centred and
 * large on a whole tile, in the visible strip on a queued one. The font is sized so even a
 * three-digit number clears the edges.
 */
export function numberLayout(
  w: number,
  h: number,
  mini: boolean,
): { x: number; y: number; fontPx: number } {
  const widest = (w * 0.86) / (3 * DIGIT_EM);
  if (mini) {
    const strip = h * PEEK_SHARE;
    return { x: 0, y: h / 2 - strip / 2, fontPx: Math.round(Math.min(strip * 0.78, widest)) };
  }
  return { x: 0, y: 0, fontPx: Math.round(Math.min(h * 0.5, widest)) };
}

/** The number's font size in device pixels. */
export const badgeFontPx = (w: number, h: number, mini: boolean): number =>
  numberLayout(w, h, mini).fontPx;
