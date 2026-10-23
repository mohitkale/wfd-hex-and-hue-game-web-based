import type * as collect from "@hexhue/core/collect";

/**
 * The art library's preview levels (M11.5) in a compact form, so the v2 chunk stays small: cells and
 * shades are strings, one base-36 character per cell (`.` = empty). `tools/art/levels.ts` writes the
 * JSON; `decodeArtLevel` turns an entry back into a `CollectLevel`.
 */
export interface ArtLevelData {
  id: string;
  name: string;
  width: number;
  height: number;
  palette: string[];
  cells: string;
  shadeColors: string[];
  shadeFamily: number[];
  shadeCells: string;
  columns: collect.GroupSpec[][];
  slots: number;
  squad: number;
  spawnGap: number;
  fieldCap: number;
  subject: collect.LevelSubject;
}

const pack = (cells: readonly number[]): string =>
  cells.map((c) => (c < 0 ? "." : c.toString(36))).join("");
const unpack = (s: string): number[] => [...s].map((c) => (c === "." ? -1 : parseInt(c, 36)));

export function encodeArtLevel(level: collect.CollectLevel): ArtLevelData {
  if (!level.shades || !level.subject) throw new Error(`${level.id}: needs shades and a subject`);
  if (level.shades.colors.length > 36) throw new Error(`${level.id}: more than 36 shades`);
  return {
    id: level.id,
    name: level.name,
    width: level.width,
    height: level.height,
    palette: level.palette,
    cells: pack(level.cells),
    shadeColors: level.shades.colors,
    shadeFamily: level.shades.family,
    shadeCells: pack(level.shades.cells),
    columns: level.columns,
    slots: level.slots,
    squad: level.squad,
    spawnGap: level.spawnGap,
    fieldCap: level.fieldCap,
    subject: level.subject,
  };
}

export function decodeArtLevel(d: ArtLevelData): collect.CollectLevel {
  return {
    id: d.id,
    name: d.name,
    width: d.width,
    height: d.height,
    palette: d.palette,
    cells: unpack(d.cells),
    columns: d.columns,
    slots: d.slots,
    squad: d.squad,
    spawnGap: d.spawnGap,
    fieldCap: d.fieldCap,
    shades: { colors: d.shadeColors, family: d.shadeFamily, cells: unpack(d.shadeCells) },
    subject: d.subject,
  };
}
