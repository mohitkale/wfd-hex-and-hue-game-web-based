import type { Insets, Rect } from "../layout";

/**
 * Pure portrait layout for the v2 board, in device pixels (kept free of Phaser so it is unit tested
 * for every screen shape):
 *
 *   ┌ HUD: title · undo · retry · speed ┐
 *   │ tray: menu · coins · slot · hint  │  (levels with boosters)
 *   │  ┌ ring ───────────────────────┐  │
 *   │  │ mosaic (cubes)              │  │  familiars walk the ring and emptied cells
 *   │  └─────────────────────────────┘  │
 *   │           ◉ portal (dock)         │  apart from the picture: flights show
 *   │  [■] [■] [■]                      │  working groups (no outline until they exist)
 *   │  [□] [□] [□] [□]                  │  holding slots (waiting groups)
 *   │   col     col     col             │  summon columns (thumb zone); every box is one square tile
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
  /** The strip under the board where the portal sits, apart from the picture (`DOCK_CELLS` tall). */
  dock: Rect;
  /** Where the portal is drawn and where familiars leave and return: the middle of the dock. */
  portal: { x: number; y: number };
  /** Every group box (column front, waiting, working) is a square of this size, in device pixels. */
  tile: number;
  /** The space between tiles; a slot's tap zone is its tile plus this, so it stays a full thumb target. */
  gap: number;
  /** Cell size in whole device pixels. */
  cell: number;
  /** Padded-grid stride (`boardWidth + 2`). */
  stride: number;
  field: Rect[];
  slots: Rect[];
  /** Full-height tap zones, one per summon column. */
  columns: Rect[];
}

/** The dock under the board, in cells: room for the portal and a visible flight to the picture. */
export const DOCK_CELLS = 1.3;

export const CSS = {
  maxWidth: 480,
  hud: 52,
  gap: 8,
  sidePad: 12,
  tray: 30,
  slot: 52,
  columnsMin: 110,
  columnsMax: 172,
} as const;

const COMPACT_BELOW = 700;
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
  const columnsH = clamp(Math.round(frame.h * 0.2), px(CSS.columnsMin), px(CSS.columnsMax));
  const columnsY = frame.y + frame.h - columnsH;
  const colGap = input.columns > 4 ? Math.round(gap / 2) : gap;
  const columns = row(inner, input.columns, Math.round(frame.w), colGap, columnsY, columnsH);

  // One size for every group box, whatever it is doing (column front, waiting, working): the largest
  // square that fits the thumb zone's columns and each row of tiles, up to 52 css px.
  const fit = (count: number, g: number) => Math.floor((inner.w - (count - 1) * g) / count);
  const tile = Math.max(
    1,
    Math.min(
      px(CSS.slot),
      Math.floor((columns[0]?.w ?? px(CSS.slot)) * 0.94),
      fit(input.slots, gap),
      fit(input.fieldCap, gap),
    ),
  );
  const slotY = columnsY - gap - tile;
  const slots = row(inner, input.slots, tile, gap, slotY, tile);
  const fieldY = slotY - gap - tile;
  const field = row(inner, input.fieldCap, tile, gap, fieldY, tile);

  const trayH = input.tray ? px(CSS.tray) : 0;
  const tray: Rect = { x: inner.x, y: hud.y + hud.h, w: inner.w, h: trayH };
  const boardTop = tray.y + trayH;
  const boardBottom = fieldY - gap;
  const ringW = input.boardWidth + 2;
  const ringH = input.boardHeight + 2;
  const cell = Math.max(
    1,
    Math.floor(Math.min(inner.w / ringW, (boardBottom - boardTop) / (ringH + DOCK_CELLS))),
  );
  const bw = ringW * cell;
  const bh = ringH * cell;
  const dockH = Math.round(DOCK_CELLS * cell);
  const boardRect: Rect = {
    x: frame.x + Math.floor((frame.w - bw) / 2),
    y: boardTop + Math.floor((boardBottom - boardTop - bh - dockH) / 2),
    w: bw,
    h: bh,
  };
  const dock: Rect = { x: boardRect.x, y: boardRect.y + bh, w: bw, h: dockH };
  const portal = {
    x: boardRect.x + (input.portalX + 1.5) * cell,
    y: dock.y + dock.h / 2,
  };
  return {
    dpr,
    frame,
    hud,
    tray,
    boardRect,
    dock,
    portal,
    tile,
    gap,
    cell,
    stride: ringW,
    field,
    slots,
    columns,
  };
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

/** Device pixels per sprite unit so a 16-unit familiar is about 1.6 cells wide (1..6; smooth art needs no whole numbers). */
export function spriteScaleForCell(cell: number, spriteWidth = 16): number {
  return clamp((cell * 1.6) / spriteWidth, 1, 6);
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
