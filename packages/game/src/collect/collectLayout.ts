import type { Insets, Rect } from "../layout";

/**
 * Pure portrait layout for the v2 board, in device pixels (kept free of Phaser so it is unit tested
 * for every screen shape):
 *
 *   ┌ HUD: title · undo · retry · speed ┐
 *   │ tray: coins · extra slot · hint   │  (levels with boosters)
 *   │  ┌ ring ───────────────────────┐  │
 *   │  │ mosaic (cubes)              │  │  familiars walk the ring and emptied cells
 *   │  └──────────── ◉ portal ───────┘  │
 *   │  [working] [working] [working]    │  field strip (groups with familiars out)
 *   │  [slot] [slot] [slot] [slot]      │  holding slots (waiting groups)
 *   │   col     col     col             │  summon columns (thumb zone)
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
  /** Cell size in whole device pixels. */
  cell: number;
  /** Padded-grid stride (`boardWidth + 2`). */
  stride: number;
  field: Rect[];
  slots: Rect[];
  /** Full-height tap zones, one per summon column. */
  columns: Rect[];
}

export const CSS = {
  maxWidth: 480,
  hud: 52,
  gap: 8,
  sidePad: 12,
  field: 46,
  tray: 34,
  slot: 54,
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

  const slotH = px(CSS.slot);
  const slotY = columnsY - gap - slotH;
  const slots = row(inner, input.slots, px(CSS.slot), gap, slotY, slotH);

  const fieldH = px(CSS.field);
  const fieldY = slotY - gap - fieldH;
  const field = row(inner, input.fieldCap, px(CSS.slot) * 2, gap, fieldY, fieldH);

  const trayH = input.tray ? px(CSS.tray) : 0;
  const tray: Rect = { x: inner.x, y: hud.y + hud.h, w: inner.w, h: trayH };
  const boardTop = tray.y + trayH + (trayH > 0 ? Math.round(gap / 2) : 0);
  const boardBottom = fieldY - gap;
  const ringW = input.boardWidth + 2;
  const ringH = input.boardHeight + 2;
  const cell = Math.max(1, Math.floor(Math.min(inner.w / ringW, (boardBottom - boardTop) / ringH)));
  const bw = ringW * cell;
  const bh = ringH * cell;
  const boardRect: Rect = {
    x: frame.x + Math.floor((frame.w - bw) / 2),
    y: boardTop + Math.floor((boardBottom - boardTop - bh) / 2),
    w: bw,
    h: bh,
  };
  return { dpr, frame, hud, tray, boardRect, cell, stride: ringW, field, slots, columns };
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

/** Whole-number sprite scale so a 16 px familiar is about 1.6 cells wide (2..6). */
export function spriteScaleForCell(cell: number, spriteWidth = 16): number {
  return clamp(Math.round((cell * 1.6) / spriteWidth), 1, 6);
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
