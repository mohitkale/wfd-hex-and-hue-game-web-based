import type { Insets, Rect } from "../layout";
import { trayCount } from "./trays";

/**
 * Pure portrait layout for the v2 board, in device pixels (kept free of Phaser so it is unit tested
 * for every screen shape):
 *
 *   ┌ HUD: title · undo · retry · speed ┐
 *   │ tray: menu · coins · slot · hint  │  (levels with boosters)
 *   │  ┌ ring ───────────────────────┐  │
 *   │  │ mosaic (cubes)              │  │  familiars walk the ring and emptied cells
 *   │  └─────────────────────────────┘  │  (nothing is drawn around the picture)
 *   │  [□] [□] [□] [□] [□]              │  active boxes: bordered, as many as may work at once
 *   │  [□] [□] [□] [□]                  │  holding slots (waiting groups)
 *   │  [■] [■] [■]                      │  summon columns: the next three boxes of each, a grid
 *   │  [■] [■] [■]                      │  with gaps; the rest stay hidden; columns centre as a
 *   │  [■] [■] [■]                      │  group when one runs out. Every box is one square tile.
 *   └───────────────────────────────────┘
 */

export interface CollectLayoutInput {
  /** Canvas size in device pixels. */
  width: number;
  height: number;
  dpr: number;
  insets: Insets;
  boardWidth: number;
  boardHeight: number;
  slots: number;
  columns: number;
  fieldCap: number;
  /** Every tray works (M15.13): `slots` trays in all, instead of `fieldCap + slots`. */
  sharedTrays?: boolean;
  portalX: number;
  /** Reserve a strip under the HUD for the booster tray (M14.4). */
  tray?: boolean;
}

export interface CollectLayout {
  dpr: number;
  frame: Rect;
  hud: Rect;
  /** The booster tray under the HUD (zero height when the level has none). */
  tray: Rect;
  /** The mosaic plus its one-cell ring. */
  boardRect: Rect;
  /** The walkway cell where a familiar is drawn when it has no box to come from. */
  portal: { x: number; y: number };
  /**
   * The hole between the picture and the trays (M15.13): familiars come out of their box's tray and
   * carry every cube into here. `rx`/`ry` are its half-width and half-height.
   */
  hole: { x: number; y: number; rx: number; ry: number };
  /** Every group box (column front, waiting, working) is a square of this size, in device pixels. */
  tile: number;
  /** The space between tiles; a slot's tap zone is its tile plus this, so it stays a full thumb target. */
  gap: number;
  /** The space between columns. */
  colGap: number;
  /** Cell size in whole device pixels. */
  cell: number;
  /** Padded-grid stride (`boardWidth + 2`). */
  stride: number;
  /** The single row of trays (working and pending boxes share it): `fieldCap + slots` of them. */
  trays: Rect[];
  /** Tap zones, one per summon column (the column's own place before they centre). */
  columns: Rect[];
}

/** At most this many boxes of a column are shown (the front one and the next two); the rest stay hidden. */
export const COLUMN_VISIBLE = 3;

export const CSS = {
  maxWidth: 480,
  hud: 52,
  gap: 8,
  sidePad: 12,
  tray: 36,
  slot: 48,
  /** Room between the picture and the trays for the hole the cubes go into. */
  hole: 72,
  /** Breathing room under the columns (the OS home bar is handled by the safe-area insets). */
  bottomPad: 6,
} as const;

const COMPACT_BELOW = 700;
/**
 * The largest a cube is drawn, in css px (M15.13: tiny boards had giant cubes; then the owner asked
 * for cubes about half a familiar's size, so 16).
 */
export const MAX_CELL_CSS = 16;
/** Screens at least this tall (css px) get the full room around the hole; at or below the other, a quarter. */
const HOLE_FULL_FROM = 780;
const HOLE_FULL_BELOW = 667;
const MIN_COMPACT = 0.62;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** `count` equal tiles of at most `max` px centred in `area` with `gap` between them. */
function row(area: Rect, count: number, max: number, gap: number, y: number, h: number): Rect[] {
  const w = Math.min(max, Math.floor((area.w - (count - 1) * gap) / count));
  const total = count * w + (count - 1) * gap;
  const x0 = area.x + Math.floor((area.w - total) / 2);
  return Array.from({ length: count }, (_, i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

export function computeCollectLayout(input: CollectLayoutInput): CollectLayout {
  const { dpr, insets } = input;
  const safeW = input.width - insets.left - insets.right;
  const safeH = input.height - insets.top - insets.bottom;
  const compact = clamp(safeH / dpr / COMPACT_BELOW, MIN_COMPACT, 1);
  const px = (css: number) => Math.round(css * dpr * compact);
  const frameW = Math.min(safeW, Math.round(CSS.maxWidth * dpr));
  const frame: Rect = {
    x: insets.left + Math.floor((safeW - frameW) / 2),
    y: insets.top,
    w: frameW,
    h: safeH,
  };
  const gap = px(CSS.gap);
  const pad = px(CSS.sidePad);
  const inner: Rect = { x: frame.x + pad, y: frame.y, w: frame.w - 2 * pad, h: frame.h };

  const hud: Rect = { x: frame.x, y: frame.y, w: frame.w, h: px(CSS.hud) };
  // Colours boxes, trays and the boxes' grid share one spacing (`gap`), horizontally and vertically.
  const colGap = gap;
  const trayTotal = trayCount(input.fieldCap, input.slots, input.sharedTrays);
  const fit = (count: number) => Math.floor((inner.w - (count - 1) * gap) / count);
  // One size for every box, whatever it is doing (in a column or in a tray): the largest square that
  // fits the widest row (the columns or the trays), up to 48 css px.
  const tile = Math.max(1, Math.min(px(CSS.slot), fit(input.columns), fit(trayTotal)));
  // A column shows its next COLUMN_VISIBLE boxes as a real grid, front box at the top.
  const columnsH = COLUMN_VISIBLE * tile + (COLUMN_VISIBLE - 1) * gap;
  const columnsY = frame.y + frame.h - columnsH - px(CSS.bottomPad);
  const columns = row(inner, input.columns, tile, colGap, columnsY, columnsH);
  const trayY = columnsY - gap * 2 - tile;
  const trays = row(inner, trayTotal, tile, gap, trayY, tile);

  const trayH = input.tray ? px(CSS.tray) : 0;
  const tray: Rect = { x: inner.x, y: hud.y + hud.h, w: inner.w, h: trayH };
  const boardTop = tray.y + trayH;
  // The room around the hole (M15.13: tripled so the familiars' drop into it can be seen). Short
  // screens get less, down to a quarter, so cubes stay readable there.
  const tall = clamp((safeH / dpr - HOLE_FULL_BELOW) / (HOLE_FULL_FROM - HOLE_FULL_BELOW), 0, 1);
  const holeRoom = px(CSS.hole * (1 / 4 + (3 / 4) * tall));
  const boardBottom = trayY - gap - holeRoom;
  const ringW = input.boardWidth + 2;
  const ringH = input.boardHeight + 2;
  // The ring is only a walkway: nothing is drawn around the picture, so the picture may use nearly the
  // whole width of the frame.
  const side = Math.round(gap / 2);
  const wide = frame.w - 2 * side;
  // Capped, so a tiny board (the tutorial's) gets pixel-sized cubes, not giant blocks.
  const cell = Math.max(
    1,
    Math.floor(Math.min(wide / ringW, (boardBottom - boardTop) / ringH, MAX_CELL_CSS * dpr)),
  );
  const bw = ringW * cell;
  const bh = ringH * cell;
  const boardRect: Rect = {
    x: frame.x + Math.floor((frame.w - bw) / 2),
    y: boardTop + Math.floor((boardBottom - boardTop - bh) / 2),
    w: bw,
    h: bh,
  };
  // Where a familiar with no box to come from (a fallback) is drawn: the walkway cell of the portal.
  const portal = {
    x: boardRect.x + (input.portalX + 1.5) * cell,
    y: boardRect.y + boardRect.h - cell / 2,
  };
  // The hole sits in the space under the picture (its own room plus the gap above the trays); it is
  // sized to fit there, so on short phones it shrinks rather than taking cube size away.
  const below = boardRect.y + boardRect.h;
  // The hole sits in the middle of the space between the picture and the trays, with clear space
  // around it for the familiars climbing up from the trays and dropping in from the edge.
  const room = Math.max(px(10), trayY - below);
  const holeRy = Math.round(Math.min(room * 0.18, px(14), tile * 0.3));
  const hole = {
    x: portal.x,
    y: Math.round(below + room * 0.5),
    rx: Math.round(holeRy / 0.55),
    ry: holeRy,
  };
  return {
    dpr,
    frame,
    hud,
    tray,
    boardRect,
    portal,
    hole,
    tile,
    gap,
    colGap,
    cell,
    stride: ringW,
    trays,
    columns,
  };
}

/** The front box of a column drawn at `colRect` (what a ring around the column should hug). */
export function frontBoxRect(layout: CollectLayout, colRect: Rect): Rect {
  return {
    x: colRect.x + (colRect.w - layout.tile) / 2,
    y: colRect.y,
    w: layout.tile,
    h: layout.tile,
  };
}

/**
 * The columns that still hold boxes, centred as a group (a column that has run out leaves, and the
 * rest slide to the middle). `active[i]` says whether column `i` still has a box; the result has a rect
 * for each active column and `null` for the others. Pure.
 */
export function activeColumnRects(
  layout: CollectLayout,
  active: readonly boolean[],
): (Rect | null)[] {
  const n = active.filter(Boolean).length;
  const w = layout.columns[0]?.w ?? 0;
  const total = n * w + Math.max(0, n - 1) * layout.colGap;
  const x0 = layout.frame.x + Math.floor((layout.frame.w - total) / 2);
  let k = 0;
  return layout.columns.map((r, i) =>
    active[i] ? { ...r, x: x0 + k++ * (w + layout.colGap) } : null,
  );
}

/** Screen position of the centre of padded-grid cell `idx`. */
export function cellCenter(layout: CollectLayout, idx: number): { x: number; y: number } {
  const px = idx % layout.stride;
  const py = Math.floor(idx / layout.stride);
  return {
    x: layout.boardRect.x + (px + 0.5) * layout.cell,
    y: layout.boardRect.y + (py + 0.5) * layout.cell,
  };
}

/** Device pixels per sprite unit so a 16-unit familiar is about 1.15 cells wide (0.7..6; smooth art needs no whole numbers). */
export function spriteScaleForCell(cell: number, spriteWidth = 16, minPx = 0): number {
  return clamp(Math.max(cell * 1.15, minPx) / spriteWidth, 0.7, 6);
}

/**
 * The smallest a familiar is drawn, in css px (M15.13): on big pictures the cells are about 10 px, and
 * a bat or cat drawn at cell size was too small to read as one. It may be larger than a cube.
 */
export const MIN_FAMILIAR_CSS = 24;

/** The largest a familiar is drawn, in css px. */
export const MAX_FAMILIAR_CSS = 34;

/**
 * A familiar's sprite scale on cells of `cell` device px (M15.13, owner request): about twice a cube
 * wide, so a cube reads as half a familiar, never smaller than `MIN_FAMILIAR_CSS` nor larger than
 * `MAX_FAMILIAR_CSS` css px.
 */
export function familiarScale(cell: number, dpr: number, spriteWidth = 16): number {
  const px = clamp(cell * 2.1, MIN_FAMILIAR_CSS * dpr, MAX_FAMILIAR_CSS * dpr);
  return px / spriteWidth;
}

/** The HUD buttons: a 36 css px circle inside a 44 css px tap target. */
export const HUD_BUTTON_CSS = 36;
export const HUD_ZONE_CSS = 44;

/** Centre x of HUD button `index` of `count` (right-aligned, 8 css px apart); shared by the baked circles and the tap zones. */
export function hudButtonX(layout: CollectLayout, index: number, count: number): number {
  const size = Math.round(HUD_BUTTON_CSS * layout.dpr);
  return (
    layout.frame.x +
    layout.frame.w -
    14 * layout.dpr -
    size / 2 -
    (count - 1 - index) * (size + 8 * layout.dpr)
  );
}
