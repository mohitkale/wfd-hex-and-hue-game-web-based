import * as collect from "@hexhue/core/collect";

/**
 * The rules the board is played by (M15.13, docs/V2_TRAYS.md), applied to every level a player
 * reaches outside the tutorial: one row of trays where **every tray works**, the way the owner's
 * reference game plays. A box in a tray sends its familiars out whenever its colour can be reached, and
 * simply waits in its own tray when nothing is in reach; the game is lost only when every tray holds a
 * box that cannot work. Squads are larger and familiars leave a tray every few ticks, so the trays emit a
 * steady stream and the picture clears at a pace that matches the calmer walk.
 *
 * How many trays and how many columns of boxes a board has follows the size of its picture
 * (`boardShape`): a bigger picture gets more of both, as in the reference. Every level this produces is
 * checked by the production gate (`tools/collect/production.ts`).
 */
/**
 * At most this many familiars of one box out at once: enough that the stream never waits for one to
 * come back (a round trip on a 40-wide board takes several seconds), so a tray empties at a steady
 * pace.
 */
export const TRAY_SQUAD = 40;
/**
 * Ticks between two familiars leaving one tray, at the slice's pace (scaled by board width): about
 * 0.2 s, about one and a half familiars apart as they walk (owner request).
 */
export const TRAY_SPAWN_GAP = 1.4;

/**
 * Ticks each familiar spends between its tray and the board's walkway, and between the walkway and
 * the hole (M15.13): time to climb out of the tray, walk the lane and step onto the walkway, and to
 * drop down the hole on the way back.
 */
export const TRAY_GATE = 10;

/**
 * Edge-first routes: a step inside the picture costs this much against 1 on its margin, so familiars
 * walk up the left, right and top edges and cut in near their cube, keeping the middle clear.
 */
export const TRAY_EDGE_BIAS = 3;

/** Ticks (at the slice's pace) a newly chosen box's tray takes to open before its first familiar leaves. */
export const TRAY_OPEN = 4;

/** Pictures with fewer cubes than this get the small board shape. */
export const LARGE_PICTURE = 400;

/**
 * Trays and box columns for a picture of `cubes` cubes in `boxes` boxes (owner feedback: a small
 * puzzle has 3 or 4 trays, and never more trays or columns than it has boxes, so the two-box tutorial
 * shows two): a small picture gets 3 trays (4 when it has more than 6 boxes) and 3 columns, a large
 * one 5 trays and 4 columns.
 */
export function boardShape(cubes: number, boxes = Infinity): { trays: number; columns: number } {
  const shape =
    cubes < LARGE_PICTURE ? { trays: boxes > 6 ? 4 : 3, columns: 3 } : { trays: 5, columns: 4 };
  return {
    trays: Math.max(1, Math.min(shape.trays, boxes)),
    columns: Math.max(1, Math.min(shape.columns, boxes)),
  };
}

/**
 * Deals a level's boxes into `count` columns. The boxes are read the way the board shows them (every
 * column's front box, then every second box, and so on) and dealt out again in that order, so what
 * was near the front stays near the front.
 */
export function redeal(
  columns: readonly collect.GroupSpec[][],
  count: number,
): collect.GroupSpec[][] {
  if (columns.length === count) return columns.map((c) => c.slice());
  const order: collect.GroupSpec[] = [];
  const depth = Math.max(...columns.map((c) => c.length));
  for (let d = 0; d < depth; d++) for (const c of columns) if (c[d]) order.push(c[d]!);
  const n = Math.max(1, Math.min(count, order.length));
  const out: collect.GroupSpec[][] = Array.from({ length: n }, () => []);
  order.forEach((g, i) => out[i % n]!.push({ ...g }));
  return out;
}

/**
 * How many board widths of 16 cells (the slice's walkway) a level spans. The board shows a tick per
 * cell walked at a steady on-screen speed (`ticksPerSecondFor`), so a wider picture shows more ticks a
 * second; everything else counted in ticks (the walk out of the tray, the drop into the hole, the gap
 * between familiars) is scaled by this, so every level has the same pace at 1× (M15.13: a narrow
 * picture's 1× looked like 3× on a wide one).
 */
export const paceScale = (level: { width: number }): number => Math.max(1, (level.width + 2) / 16);

export function withSharedTrays(level: collect.CollectLevel): collect.CollectLevel {
  if (level.sharedTrays) return level;
  const k = paceScale(level);
  const L = collect.COLLECT_LIMITS;
  const cubes = level.cells.filter((c) => c >= 0).length;
  const shape = boardShape(cubes, level.columns.flat().length);
  const trays = Math.min(L.maxSlots, L.maxFieldCap, shape.trays);
  return {
    ...level,
    columns: redeal(level.columns, Math.min(L.maxColumns, shape.columns)),
    sharedTrays: true,
    slots: trays,
    fieldCap: trays,
    squad: Math.max(level.squad, TRAY_SQUAD),
    spawnGap: Math.max(1, Math.round(TRAY_SPAWN_GAP * k)),
    gate: Math.min(40, Math.round(TRAY_GATE * k)),
    edgeGate: true,
    edgeBias: TRAY_EDGE_BIAS,
    // Bottom row first, from the centre out, left and right in turn (owner direction, after the reference).
    rowTargets: true,
    // The tray opens before the first familiar leaves (about 0.6 s at 1×, a third of that at 3×).
    openDelay: Math.round(TRAY_OPEN * k),
  };
}
