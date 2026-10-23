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

export function badgeBox(
  layout: CollectLayout,
  place: Place,
  index: number,
  depth: number,
): BadgeBox {
  const l = layout;
  if (place === "field") {
    const r = l.field[index] ?? l.field[l.field.length - 1]!;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h, mini: false };
  }
  if (place === "slot") {
    const r = l.slots[index] ?? l.slots[0]!;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h, mini: false };
  }
  const r = l.columns[index]!;
  if (depth === 0) {
    const h = Math.min(r.h * 0.6, r.w * 1.05);
    return { x: r.x + r.w / 2, y: r.y + h / 2 + r.h * 0.02, w: r.w * 0.94, h, mini: false };
  }
  const miniH = Math.min(r.h * 0.17, r.w * 0.3);
  const top = r.y + Math.min(r.h * 0.6, r.w * 1.05) + r.h * 0.04;
  return {
    x: r.x + r.w / 2,
    y: top + (depth - 0.5) * (miniH + r.h * 0.02),
    w: r.w * (depth === 1 ? 0.8 : 0.66),
    h: miniH,
    mini: true,
  };
}

/** A badge wide enough to put the creature beside the number rather than above it. */
export const isHorizontal = (w: number, h: number): boolean => w >= h * 1.25;

/** The creature's whole-number sprite scale in a badge (16×14 px art). */
export function iconScale(w: number, h: number): number {
  const horizontal = isHorizontal(w, h);
  return Math.max(1, Math.floor(Math.min((h * 0.62) / 14, (w * (horizontal ? 0.4 : 0.7)) / 16)));
}

/** Widest a bold digit gets, in ems (a little over the usual 0.6). */
export const DIGIT_EM = 0.64;

/**
 * Where the number sits in a badge and how big it is, in device pixels from the badge centre. A wide
 * badge (the field strip) puts the creature on the left and the number in the space to its right: the
 * font is sized so even a three-digit number clears the creature and the edge.
 */
export function numberLayout(
  w: number,
  h: number,
  mini: boolean,
): { x: number; y: number; fontPx: number } {
  if (mini) return { x: 0, y: 0, fontPx: Math.round(Math.min(h * 0.62, w * 0.7)) };
  if (!isHorizontal(w, h))
    return { x: 0, y: h * 0.3, fontPx: Math.round(Math.min(h * 0.36, w * 0.34)) };
  const iconRight = -w * 0.2 + (16 * iconScale(w, h)) / 2; // the icon sits at -0.2 w
  const gap = w * 0.04;
  const left = iconRight + gap;
  const right = w / 2 - gap;
  const room = right - left;
  return {
    x: left + room / 2,
    y: 0,
    fontPx: Math.round(Math.min(h * 0.5, room / (3 * DIGIT_EM))),
  };
}

/** The number's font size in device pixels. */
export const badgeFontPx = (w: number, h: number, mini: boolean): number =>
  numberLayout(w, h, mini).fontPx;
