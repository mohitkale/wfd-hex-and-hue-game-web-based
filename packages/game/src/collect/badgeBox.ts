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

/**
 * The number's font size in device pixels. A wide badge (the field strip) has the creature on the
 * left and the whole right half for the number, so it can be bigger than in a square one.
 */
export function badgeFontPx(w: number, h: number, mini: boolean): number {
  if (mini) return Math.round(Math.min(h * 0.62, w * 0.7));
  if (isHorizontal(w, h)) return Math.round(Math.min(h * 0.5, w * 0.26));
  return Math.round(Math.min(h * 0.36, w * 0.34));
}
