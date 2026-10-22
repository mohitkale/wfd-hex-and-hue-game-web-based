import { EMPTY } from "../level";
import { legalActions } from "./actions";
import { createCollectState } from "./state";

/** One summon group as authored: a colour and how many cubes it may deliver. */
export interface GroupSpec {
  color: number;
  /** Integer ≥ 1. */
  capacity: number;
}

/** A v2 level as authored and shipped (docs/V2_PROTOTYPE_SPEC.md §2). */
export interface CollectLevel {
  id: string;
  name: string;
  /** Mosaic cells, 1..40. */
  width: number;
  height: number;
  /** `#rrggbb`; cell and group colours index into this. */
  palette: string[];
  /** Unpadded, row-major (`y * width + x`, y = 0 is the top row): palette index or `EMPTY`. */
  cells: number[];
  /** `columns[c][0]` is the front (selectable) group. */
  columns: GroupSpec[][];
  /** Holding slots K. */
  slots: number;
  /** Familiars one group may have out at once. */
  squad: number;
  /** Ticks between spawns of one group. */
  spawnGap: number;
  /** Groups that may work at once. */
  fieldCap: number;
  /** Portal column in `[0, width - 1]`; default `floor((width - 1) / 2)`. */
  portalX?: number;
}

export const COLLECT_LIMITS = {
  maxSize: 40,
  maxColors: 16,
  maxColumns: 6,
  maxSlots: 8,
  maxSquad: 6,
  maxFieldCap: 6,
} as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export const defaultPortalX = (width: number): number => Math.floor((width - 1) / 2);

/**
 * Every rule a level must satisfy (GAME_DESIGN_V2 §3): shape and limits, colours, the per-colour
 * capacity = cube-count invariant, `portalX`, and that at least one front group has an accessible
 * cube (R-20). Returns human-readable errors; empty means valid.
 */
export function validateCollectLevel(level: CollectLevel): string[] {
  const errors: string[] = [];
  const L = COLLECT_LIMITS;
  const { width, height, palette, cells, columns } = level;

  if (!level.id) errors.push("id is required");
  if (!isInt(width) || width < 1 || width > L.maxSize) errors.push(`width must be 1..${L.maxSize}`);
  if (!isInt(height) || height < 1 || height > L.maxSize)
    errors.push(`height must be 1..${L.maxSize}`);
  if (palette.length < 1 || palette.length > L.maxColors)
    errors.push(`palette must have 1..${L.maxColors} colors`);
  palette.forEach((p, i) => {
    if (!HEX_COLOR.test(p)) errors.push(`palette[${i}] "${p}" is not #rrggbb`);
  });
  if (!isInt(level.slots) || level.slots < 1 || level.slots > L.maxSlots)
    errors.push(`slots must be 1..${L.maxSlots}`);
  if (!isInt(level.squad) || level.squad < 1 || level.squad > L.maxSquad)
    errors.push(`squad must be 1..${L.maxSquad}`);
  if (!isInt(level.spawnGap) || level.spawnGap < 1) errors.push("spawnGap must be an integer ≥ 1");
  if (!isInt(level.fieldCap) || level.fieldCap < 1 || level.fieldCap > L.maxFieldCap)
    errors.push(`fieldCap must be 1..${L.maxFieldCap}`);
  if (
    level.portalX !== undefined &&
    (!isInt(level.portalX) || level.portalX < 0 || level.portalX >= width)
  )
    errors.push(`portalX must be an integer in 0..${width - 1}`);

  if (cells.length !== width * height) {
    errors.push(`cells has ${cells.length} entries, expected ${width * height}`);
  }
  cells.forEach((c, i) => {
    if (!isInt(c) || c < EMPTY || c >= palette.length)
      errors.push(`cells[${i}] = ${c} is not EMPTY or a palette index`);
  });
  if (!cells.some((c) => c !== EMPTY)) errors.push("mosaic has no cubes");

  if (columns.length < 1 || columns.length > L.maxColumns)
    errors.push(`columns must have 1..${L.maxColumns} entries`);
  columns.forEach((column, ci) => {
    if (column.length === 0) errors.push(`columns[${ci}] is empty`);
    column.forEach((g, gi) => {
      if (!isInt(g.color) || g.color < 0 || g.color >= palette.length)
        errors.push(`columns[${ci}][${gi}].color ${g.color} is not a palette index`);
      if (!isInt(g.capacity) || g.capacity < 1)
        errors.push(`columns[${ci}][${gi}].capacity must be an integer ≥ 1`);
    });
  });

  if (errors.length === 0) {
    const cubes = new Array<number>(palette.length).fill(0);
    for (const c of cells) if (c !== EMPTY) cubes[c]!++;
    const capacity = new Array<number>(palette.length).fill(0);
    for (const column of columns) for (const g of column) capacity[g.color]! += g.capacity;
    palette.forEach((_, color) => {
      if (cubes[color] !== capacity[color]) {
        errors.push(
          `color ${color}: group capacities total ${capacity[color]} but the mosaic has ${cubes[color]} cubes`,
        );
      }
    });
  }
  if (errors.length === 0 && legalActions(createCollectState(level)).length === 0) {
    errors.push("no front group has an accessible cube: the level has no legal first action");
  }
  return errors;
}

/** Parses untrusted JSON into a `CollectLevel`, checking its shape and then every rule. */
export function parseCollectLevel(json: unknown): CollectLevel {
  const fail = (msg: string): never => {
    throw new Error(`Invalid level: ${msg}`);
  };
  if (typeof json !== "object" || json === null) fail("not an object");
  const o = json as Record<string, unknown>;
  const str = (k: string) =>
    typeof o[k] === "string" ? (o[k] as string) : fail(`${k} must be a string`);
  const num = (k: string) =>
    typeof o[k] === "number" ? (o[k] as number) : fail(`${k} must be a number`);
  const arr = (k: string) =>
    Array.isArray(o[k]) ? (o[k] as unknown[]) : fail(`${k} must be an array`);

  const level: CollectLevel = {
    id: str("id"),
    name: str("name"),
    width: num("width"),
    height: num("height"),
    palette: arr("palette").map((p, i) =>
      typeof p === "string" ? p : fail(`palette[${i}] must be a string`),
    ),
    cells: arr("cells").map((c, i) =>
      typeof c === "number" ? c : fail(`cells[${i}] must be a number`),
    ),
    columns: arr("columns").map((col, ci) =>
      Array.isArray(col)
        ? col.map((g: unknown, gi): GroupSpec => {
            const gg = g as Record<string, unknown> | null;
            if (!gg || typeof gg.color !== "number" || typeof gg.capacity !== "number")
              fail(`columns[${ci}][${gi}] must be {color, capacity}`);
            return { color: gg!.color as number, capacity: gg!.capacity as number };
          })
        : fail(`columns[${ci}] must be an array`),
    ),
    slots: num("slots"),
    squad: num("squad"),
    spawnGap: num("spawnGap"),
    fieldCap: num("fieldCap"),
  };
  if (o.portalX !== undefined) level.portalX = num("portalX");
  const errors = validateCollectLevel(level);
  if (errors.length > 0) fail(errors.join("; "));
  return level;
}
