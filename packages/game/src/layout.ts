/**
 * Pure portrait layout for the play screen, in device pixels. Kept free of Phaser so it can be unit
 * tested for every screen shape.
 *
 *   ┌ HUD ──────────────────┐
 *   │        portal ✦        │
 *   │ ┌ track ring ───────┐ │
 *   │ │      mosaic       │ │
 *   │ └───────────────────┘ │
 *   │ [ ] [ ] [ ] [ ] [ ]   │  holding slots
 *   │  col    col    col    │  summon columns (thumb zone)
 *   └───────────────────────┘
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutInput {
  /** Canvas size in device pixels. */
  width: number;
  height: number;
  dpr: number;
  /** Safe-area insets in device pixels. */
  insets: Insets;
  boardWidth: number;
  boardHeight: number;
  slots: number;
  columns: number;
}

export interface Layout {
  dpr: number;
  /** The play column: safe area, capped in width and centered. */
  frame: Rect;
  hud: Rect;
  portal: { x: number; y: number; r: number };
  /** Mosaic plus the one-cell track ring around it. */
  boardRect: Rect;
  /** Screen position of mosaic cell (0, 0)'s top-left corner. */
  originX: number;
  originY: number;
  /** Cell size in whole device pixels. */
  cell: number;
  slots: Rect[];
  /** Full-height tap zones, one per summon column. */
  columns: Rect[];
}

/** Design sizes in CSS pixels. */
export const CSS = {
  maxPlayWidth: 480,
  hud: 52,
  portalSpace: 44,
  gap: 10,
  sidePad: 16,
  slot: 54,
  columnsMin: 132,
  columnsMax: 210,
} as const;

export function computeLayout(input: LayoutInput): Layout {
  const { dpr, insets } = input;
  const px = (css: number) => Math.round(css * dpr);

  const safeW = input.width - insets.left - insets.right;
  const safeH = input.height - insets.top - insets.bottom;
  const frameW = Math.min(safeW, px(CSS.maxPlayWidth));
  const frame: Rect = {
    x: insets.left + Math.floor((safeW - frameW) / 2),
    y: insets.top,
    w: frameW,
    h: safeH,
  };

  const gap = px(CSS.gap);
  const pad = px(CSS.sidePad);
  const hud: Rect = { x: frame.x, y: frame.y, w: frame.w, h: px(CSS.hud) };

  const columnsH = clamp(Math.round(frame.h * 0.24), px(CSS.columnsMin), px(CSS.columnsMax));
  const columnsRow: Rect = {
    x: frame.x,
    y: frame.y + frame.h - columnsH,
    w: frame.w,
    h: columnsH,
  };

  const slotSize = Math.min(
    px(CSS.slot),
    Math.floor((frame.w - 2 * pad - (input.slots - 1) * gap) / input.slots),
  );
  const slotsY = columnsRow.y - gap - slotSize;
  const slotsTotal = input.slots * slotSize + (input.slots - 1) * gap;
  const slotsX = frame.x + Math.floor((frame.w - slotsTotal) / 2);
  const slots: Rect[] = Array.from({ length: input.slots }, (_, i) => ({
    x: slotsX + i * (slotSize + gap),
    y: slotsY,
    w: slotSize,
    h: slotSize,
  }));

  const portalSpace = px(CSS.portalSpace);
  const boardTop = hud.y + hud.h + portalSpace;
  const boardBottom = slotsY - gap;
  const ringW = input.boardWidth + 2;
  const ringH = input.boardHeight + 2;
  const cell = Math.max(
    1,
    Math.floor(Math.min((frame.w - 2 * pad) / ringW, (boardBottom - boardTop) / ringH)),
  );
  const boardRect: Rect = {
    x: frame.x + Math.floor((frame.w - cell * ringW) / 2),
    y: boardTop + Math.floor((boardBottom - boardTop - cell * ringH) / 2),
    w: cell * ringW,
    h: cell * ringH,
  };

  const portal = {
    x: frame.x + frame.w / 2,
    y: boardRect.y - portalSpace / 2,
    r: Math.round(portalSpace * 0.36),
  };

  const columnW = Math.floor((frame.w - 2 * pad - (input.columns - 1) * gap) / input.columns);
  const columns: Rect[] = Array.from({ length: input.columns }, (_, i) => ({
    x: frame.x + pad + i * (columnW + gap),
    y: columnsRow.y,
    w: columnW,
    h: columnsRow.h,
  }));

  return {
    dpr,
    frame,
    hud,
    portal,
    boardRect,
    originX: boardRect.x + cell,
    originY: boardRect.y + cell,
    cell,
    slots,
    columns,
  };
}

/** Center of grid cell (gx, gy) on screen; gx/gy may be -1..W / -1..H for track cells. */
export function cellCenter(layout: Layout, gx: number, gy: number): { x: number; y: number } {
  return {
    x: layout.originX + (gx + 0.5) * layout.cell,
    y: layout.originY + (gy + 0.5) * layout.cell,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
