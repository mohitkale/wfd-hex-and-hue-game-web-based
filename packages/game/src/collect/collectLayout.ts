import type { Insets, Rect } from "../layout";

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
  field: Rect[];
  slots: Rect[];
  /** Full-height tap zones, one per summon column. */
  columns: Rect[];
}

/** At most this many boxes of a column are shown (the front one and the next two); the rest stay hidden. */
export const COLUMN_VISIBLE = 3;

export const CSS = {
  maxWidth: 480,
  hud: 52,
  gap: 8,
  sidePad: 12,
  tray: 30,
  slot: 48,
  /** Breathing room under the columns (the OS home bar is handled by the safe-area insets). */
  bottomPad: 12,
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
  const colGap = input.columns > 4 ? Math.round(gap / 2) : gap;
  // One size for every group box, whatever it is doing (column, waiting, working): the largest square
  // that fits a column and each row of tiles, up to 48 css px.
  const fit = (count: number, g: number) => Math.floor((inner.w - (count - 1) * g) / count);
  const colW = row(inner, input.columns, Math.round(frame.w), colGap, 0, 0)[0]?.w ?? px(CSS.slot);
  const tile = Math.max(
    1,
    Math.min(
      px(CSS.slot),
      Math.floor(colW * 0.94),
      fit(input.slots, gap),
      fit(input.fieldCap, gap),
    ),
  );
  // A column shows its next COLUMN_VISIBLE boxes as a real grid with gaps, front box at the top.
  const columnsH = COLUMN_VISIBLE * tile + (COLUMN_VISIBLE - 1) * gap + gap;
  const columnsY = frame.y + frame.h - columnsH - px(CSS.bottomPad);
  const columns = row(inner, input.columns, Math.round(frame.w), colGap, columnsY, columnsH);
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
  // The ring is only a walkway: nothing is drawn around the picture, so the picture may use nearly the
  // whole width of the frame.
  const side = Math.round(gap / 2);
  const wide = frame.w - 2 * side;
  const cell = Math.max(1, Math.floor(Math.min(wide / ringW, (boardBottom - boardTop) / ringH)));
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
  return {
    dpr,
    frame,
    hud,
    tray,
    boardRect,
    portal,
    tile,
    gap,
    colGap,
    cell,
    stride: ringW,
    field,
    slots,
    columns,
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
export function spriteScaleForCell(cell: number, spriteWidth = 16): number {
  return clamp((cell * 1.15) / spriteWidth, 0.7, 6);
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
