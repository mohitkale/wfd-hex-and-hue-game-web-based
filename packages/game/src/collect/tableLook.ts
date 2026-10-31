import type { Rect } from "../layout";
import { unit } from "./swarm";

/**
 * The board's look since M15.13 (owner feedback: a bright, warm table like the reference game rather
 * than a night sky): the picture sits on a cream tray on a wooden table, the boxes are bright glossy
 * blocks and the trays stand on pale plates. Original drawing; only the arrangement and the warmth
 * follow the reference. Pure colours and painters, so the maths can be tested without Phaser.
 */
export const TABLE = {
  /** The table: two plank tones, the seam between planks and the grain lines. */
  wood: 0xebbf91,
  woodAlt: 0xe7b989,
  seam: 0xd6a272,
  grain: 0xe0b083,
  /**
   * The tray the picture sits on: light and see-through (the wood shows through), so it frames the
   * picture without competing with the cubes.
   */
  board: 0xfaf4ec,
  boardAlpha: 0.55,
  boardRim: 0xffffff,
  boardRimAlpha: 0.4,
  shadow: 0x5a2e0e,
  /** The plates the trays stand on: frosted and see-through, not solid white. */
  plate: 0xffffff,
  plateAlpha: 0.5,
  plateEdge: 0x7a4a24,
  plateEdgeAlpha: 0.4,
  /** The hole the cubes go into: its worn rim, the far inside wall and the floor down below. */
  holeRim: 0xc48d5c,
  holeLip: 0xd9a676,
  hole: 0x8a5a33,
  holeDeep: 0x4a2a12,
  /** HUD buttons: a white disc with a soft edge, and the brown ink of icons and text. */
  button: 0xfffaf3,
  buttonEdge: 0xd8c3ab,
  ink: "#5a3216",
  /** The progress bar: its track and fill. */
  track: 0x9a6538,
  fill: 0x4fc06a,
} as const;

/** Minimal drawing surface (a Phaser Graphics satisfies it). */
export interface Painter {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
  fillRoundedRect(x: number, y: number, w: number, h: number, radius: number): unknown;
}

/** Plank width in device pixels for a frame (about seven planks across a phone). */
export const plankWidth = (frameW: number): number => Math.max(24, Math.round(frameW / 7));

/**
 * Paints the wooden table over `area`: vertical planks in two tones with a seam between them and a few
 * long grain lines each, placed by a fixed hash (the same table every time).
 */
export function paintTable(g: Painter, area: Rect, plank: number, dpr: number): void {
  g.fillStyle(TABLE.wood, 1);
  g.fillRect(area.x, area.y, area.w, area.h);
  const seam = Math.max(1, Math.round(dpr * 1.5));
  const line = Math.max(1, Math.round(dpr));
  for (let i = 0, x = area.x; x < area.x + area.w; i++, x += plank) {
    if (i % 2 === 1) {
      g.fillStyle(TABLE.woodAlt, 1);
      g.fillRect(x, area.y, plank, area.h);
    }
    for (let k = 0; k < 2; k++) {
      const gx = x + plank * (0.2 + 0.6 * unit(i, 40 + k));
      const gy = area.y + area.h * unit(i, 50 + k) * 0.7;
      g.fillStyle(TABLE.grain, 0.5);
      g.fillRect(gx, gy, line, area.h * (0.25 + 0.4 * unit(i, 60 + k)));
    }
    g.fillStyle(TABLE.seam, 0.6);
    g.fillRect(x, area.y, seam, area.h);
  }
}

/** The cream tray under the picture, with a soft drop shadow and a rim. */
export function paintBoard(g: Painter, r: Rect, radius: number, dpr: number): void {
  const drop = Math.round(4 * dpr);
  g.fillStyle(TABLE.shadow, 0.18);
  g.fillRoundedRect(r.x, r.y + drop, r.w, r.h, radius);
  g.fillStyle(TABLE.boardRim, TABLE.boardRimAlpha);
  g.fillRoundedRect(r.x, r.y, r.w, r.h, radius);
  const rim = Math.max(2, Math.round(3 * dpr));
  g.fillStyle(TABLE.board, TABLE.boardAlpha);
  g.fillRoundedRect(r.x + rim, r.y + rim, r.w - 2 * rim, r.h - 2 * rim, Math.max(1, radius - rim));
}

/**
 * A tray's plate: a frosted, see-through rounded slab within the tray's own square (so the gap between
 * trays stays open), with a faint darker front edge.
 */
export function paintPlate(g: Painter, r: Rect, dpr: number): void {
  const edge = Math.max(2, Math.round(3 * dpr));
  const y = r.y + r.h * 0.12;
  const h = r.h * 0.88;
  const radius = r.w * 0.18;
  g.fillStyle(TABLE.plateEdge, TABLE.plateEdgeAlpha);
  g.fillRoundedRect(r.x, y + edge, r.w, h, radius);
  g.fillStyle(TABLE.plate, TABLE.plateAlpha);
  g.fillRoundedRect(r.x, y, r.w, h, radius);
}

/** Something that can also draw ellipses (a Phaser Graphics). */
export interface EllipsePainter extends Painter {
  fillEllipse(x: number, y: number, width: number, height: number): unknown;
}

type Hole = { x: number; y: number; rx: number; ry: number };

/** The y of the hole opening's near (front) edge: a familiar going in is cut off here. */
export const holeFrontY = (h: Hole): number => h.y + h.ry * 1.06;

/**
 * The hole the familiars carry the cubes into (M15.13), drawn under them: a worn rim and a hollow
 * opening, the far inside wall lit near the top and the floor darker further down (owner feedback:
 * it must look hollow, not like a dark patch laid over them). Its front lip is drawn over them
 * (`paintHoleFront`).
 */
export function paintHole(g: EllipsePainter, h: Hole): void {
  g.fillStyle(TABLE.holeRim, 1);
  g.fillEllipse(h.x, h.y, h.rx * 2.3, h.ry * 2.3);
  g.fillStyle(TABLE.hole, 1);
  g.fillEllipse(h.x, h.y + h.ry * 0.06, h.rx * 2, h.ry * 2);
  g.fillStyle(TABLE.holeDeep, 1);
  g.fillEllipse(h.x, h.y + h.ry * 0.5, h.rx * 1.8, h.ry * 1.1);
}

/** Something that can fill a polygon (a Phaser Graphics). */
export interface PolygonPainter {
  fillStyle(color: number, alpha?: number): unknown;
  fillPoints(points: { x: number; y: number }[], closeShape?: boolean): unknown;
}

/**
 * The hole's front lip, drawn over the familiars: the near half of the rim, between the rim's outer
 * edge and the opening, so a familiar going in slips down behind it.
 */
export function paintHoleFront(g: PolygonPainter, h: Hole, steps = 24): void {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (Math.PI * i) / steps;
    pts.push({ x: h.x + Math.cos(a) * h.rx * 1.15, y: h.y + Math.sin(a) * h.ry * 1.15 });
  }
  for (let i = steps; i >= 0; i--) {
    const a = (Math.PI * i) / steps;
    pts.push({ x: h.x + Math.cos(a) * h.rx, y: h.y + h.ry * 0.06 + Math.sin(a) * h.ry });
  }
  g.fillStyle(TABLE.holeRim, 1);
  g.fillPoints(pts, true);
  // A lighter worn edge along the inside of the lip.
  const edge: { x: number; y: number }[] = [];
  for (let i = 2; i <= steps - 2; i++) {
    const a = (Math.PI * i) / steps;
    edge.push({
      x: h.x + Math.cos(a) * h.rx * 1.04,
      y: h.y + h.ry * 0.06 + Math.sin(a) * h.ry * 1.06,
    });
  }
  for (let i = steps - 2; i >= 2; i--) {
    const a = (Math.PI * i) / steps;
    edge.push({ x: h.x + Math.cos(a) * h.rx, y: h.y + h.ry * 0.06 + Math.sin(a) * h.ry });
  }
  g.fillStyle(TABLE.holeLip, 1);
  g.fillPoints(edge, true);
}
