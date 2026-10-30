import { EMPTY } from "../cells";
import { legalActions } from "./actions";
import { createCollectState } from "./state";

/** One summon group as authored: a colour and how many cubes it may deliver. */
export interface GroupSpec {
  color: number;
  /** Integer ≥ 1. */
  capacity: number;
}

/**
 * How each cube looks, on top of the colour family it belongs to (docs/ART_DIRECTION_V2.md §1).
 * Gameplay uses only `cells`/`palette` (the family); shades are display only, so the engine, the
 * solver and every rule ignore them.
 */
export interface CellShades {
  /** `#rrggbb` display colours (one per shade). */
  colors: string[];
  /** `family[s]`: the palette index of the colour family shade `s` belongs to. */
  family: number[];
  /** Same layout as `CollectLevel.cells`: shade index or `EMPTY` (exactly where `cells` is `EMPTY`). */
  cells: number[];
}

/**
 * What a finished picture is, for the reveal and the Spellbook (docs/ART_DIRECTION_V2.md). Display
 * only, like `shades`: no rule reads it.
 */
export interface LevelSubject {
  /** The art piece id (`content/v2art`). */
  id: string;
  name: string;
  /** The art theme (moon, ritual, crystal, astrology, familiar, other): picks the completion effect. */
  theme: string;
  /** One line of lore for the card; no unsupported historical or religious claims. */
  lore: string;
}

/**
 * Wax seals (M13.4): the cubes at `cells` (unpadded indices into `CollectLevel.cells`) cannot be
 * collected until every group of colour `key` has completed. See `seals.ts` and docs/V2_VARIETY.md.
 */
export interface SealSpec {
  key: number;
  cells: number[];
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
  /**
   * Shared trays (M15.13, docs/V2_TRAYS.md): the `slots` trays hold every box out of its column,
   * working or waiting, and every one of them works whenever its colour can be reached. A box that runs
   * dry just waits in its own tray, so `slotsFull` cannot happen; the game is lost only when every tray
   * holds a box that cannot work (a deadlock). `fieldCap` must equal `slots`. Absent: the original
   * rule (`fieldCap` working places plus `slots` waiting places).
   */
  sharedTrays?: boolean;
  /**
   * The gate (M15.13): ticks a familiar spends at the portal end of each trip, coming out of its tray
   * on the way out and going down the hole on the way back. Absent or 0: none.
   */
  gate?: number;
  /**
   * Edge gate (M15.13): familiars enter and leave the picture anywhere along its bottom edge (the
   * margin row under it), at the edge cell nearest their cube, instead of all through the portal
   * cell. Distances are measured from that whole row. Absent: the single portal.
   */
  edgeGate?: boolean;
  /**
   * Edge-first routes (M15.13): walking into a cell inside the picture costs this much against 1 on
   * the margin ring, so familiars keep to the left, right and top edges and cut in near their cube.
   * Absent or 1: plain shortest paths.
   */
  edgeBias?: number;
  /**
   * Row order (M15.13): familiars take the lowest row that holds a cube they can reach, from the
   * board's centre out, alternating left and right; then the next row up. Absent: the cube nearest the
   * way in (`nearestTarget`).
   */
  rowTargets?: boolean;
  /**
   * Ticks a newly chosen box's tray takes to open before its first familiar leaves (M15.13). Counted
   * in ticks, so it shortens with the speed-up like everything else. Absent or 0: at once.
   */
  openDelay?: number;
  /** Portal column in `[0, width - 1]`; default `floor((width - 1) / 2)`. */
  portalX?: number;
  /** Optional sealed cubes; absent means every cube can be collected as soon as it is reachable. */
  seals?: SealSpec[];
  /** Optional per-cube look within each family; absent means every cube is its family colour. */
  shades?: CellShades;
  /** Optional: which picture this is, so a win can reveal it and unlock it in the Spellbook. */
  subject?: LevelSubject;
}

export const COLLECT_LIMITS = {
  maxSize: 40,
  maxColors: 16,
  /** Display shades per level (5 per family at most, ART_DIRECTION_V2 A-11). */
  maxShades: 80,
  maxColumns: 6,
  maxSlots: 8,
  maxSquad: 40,
  maxFieldCap: 6,
} as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export const defaultPortalX = (width: number): number => Math.floor((width - 1) / 2);

/** Problems with a level's optional shades (shape only; they never affect gameplay). */
function shadeErrors(shades: CellShades, families: number, cells: number[]): string[] {
  const errors: string[] = [];
  const { colors, family, cells: look } = shades;
  const max = COLLECT_LIMITS.maxShades;
  // Shades per family (1-5) is an art rule (ART_DIRECTION_V2 A-11) checked by the art pipeline,
  // not here: the level model only bounds the total.
  if (colors.length < 1 || colors.length > max) errors.push(`shades must have 1..${max} colors`);
  colors.forEach((c, i) => {
    if (!HEX_COLOR.test(c)) errors.push(`shades.colors[${i}] "${c}" is not #rrggbb`);
  });
  if (family.length !== colors.length)
    errors.push(`shades.family has ${family.length} entries, expected ${colors.length}`);
  family.forEach((f, i) => {
    if (!isInt(f) || f < 0 || f >= families)
      errors.push(`shades.family[${i}] = ${f} is not a palette index`);
  });
  if (look.length !== cells.length) {
    errors.push(`shades.cells has ${look.length} entries, expected ${cells.length}`);
    return errors;
  }
  look.forEach((s, i) => {
    const c = cells[i]!;
    if (c === EMPTY || !isInt(c)) {
      if (s !== EMPTY) errors.push(`shades.cells[${i}] = ${s} but the cell is empty`);
    } else if (!isInt(s) || s < 0 || s >= colors.length) {
      errors.push(`shades.cells[${i}] = ${s} is not a shade index`);
    } else if (family[s] !== c) {
      errors.push(
        `shades.cells[${i}]: shade ${s} belongs to family ${family[s]}, the cube is ${c}`,
      );
    }
  });
  return errors;
}

/** Problems with a level's seals (call only on a level whose colours and capacities are valid). */
function sealErrors(level: CollectLevel): string[] {
  const errors: string[] = [];
  const seals = level.seals!;
  if (!Array.isArray(seals)) return ["seals must be an array"];
  const colors = level.palette.length;
  const present = new Set<number>();
  for (const c of level.cells) if (c !== EMPTY) present.add(c);
  const sealed = new Set<number>();
  seals.forEach((seal, i) => {
    if (
      !seal ||
      !isInt(seal.key) ||
      seal.key < 0 ||
      seal.key >= colors ||
      !Array.isArray(seal.cells)
    ) {
      errors.push(`seals[${i}] must be {key, cells}`);
      return;
    }
    if (!present.has(seal.key)) errors.push(`seals[${i}]: key colour ${seal.key} has no cubes`);
    if (seal.cells.length === 0) errors.push(`seals[${i}] seals no cubes`);
    for (const cell of seal.cells) {
      if (!isInt(cell) || cell < 0 || cell >= level.cells.length || level.cells[cell] === EMPTY) {
        errors.push(`seals[${i}]: cell ${cell} is not a cube`);
        continue;
      }
      if (level.cells[cell] === seal.key)
        errors.push(`seals[${i}]: cell ${cell} is sealed by its own colour`);
      if (sealed.has(cell)) errors.push(`seals[${i}]: cell ${cell} is sealed twice`);
      sealed.add(cell);
    }
  });
  return errors;
}

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
  if (level.sharedTrays !== undefined && typeof level.sharedTrays !== "boolean")
    errors.push("sharedTrays must be a boolean");
  if (
    level.edgeBias !== undefined &&
    (!isInt(level.edgeBias) || level.edgeBias < 1 || level.edgeBias > 9)
  )
    errors.push("edgeBias must be an integer in 1..9");
  if (
    level.openDelay !== undefined &&
    (!isInt(level.openDelay) || level.openDelay < 0 || level.openDelay > 40)
  )
    errors.push("openDelay must be an integer in 0..40");
  if (level.rowTargets !== undefined && typeof level.rowTargets !== "boolean")
    errors.push("rowTargets must be a boolean");
  if (level.edgeGate !== undefined && typeof level.edgeGate !== "boolean")
    errors.push("edgeGate must be a boolean");
  if (level.gate !== undefined && (!isInt(level.gate) || level.gate < 0 || level.gate > 40))
    errors.push("gate must be an integer in 0..40");
  if (level.sharedTrays === true && level.fieldCap !== level.slots)
    errors.push("with sharedTrays, fieldCap must equal slots (every tray works)");
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
  if (level.shades) errors.push(...shadeErrors(level.shades, palette.length, cells));
  if (level.subject) {
    const s = level.subject;
    for (const key of ["id", "name", "theme", "lore"] as const) {
      if (typeof s[key] !== "string" || s[key].trim() === "")
        errors.push(`subject.${key} must be a non-empty string`);
    }
  }

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
  if (errors.length === 0 && level.seals) errors.push(...sealErrors(level));
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
  if (o.gate !== undefined) level.gate = num("gate");
  if (o.edgeBias !== undefined) level.edgeBias = num("edgeBias");
  if (o.openDelay !== undefined) level.openDelay = num("openDelay");
  if (o.rowTargets !== undefined) {
    if (typeof o.rowTargets !== "boolean") fail("rowTargets must be a boolean");
    level.rowTargets = o.rowTargets as boolean;
  }
  if (o.edgeGate !== undefined) {
    if (typeof o.edgeGate !== "boolean") fail("edgeGate must be a boolean");
    level.edgeGate = o.edgeGate as boolean;
  }
  if (o.sharedTrays !== undefined) {
    if (typeof o.sharedTrays !== "boolean") fail("sharedTrays must be a boolean");
    level.sharedTrays = o.sharedTrays as boolean;
  }
  if (o.subject !== undefined) {
    const sub = o.subject as Record<string, unknown> | null;
    if (!sub || typeof sub !== "object") fail("subject must be an object");
    const text = (k: string) =>
      typeof sub![k] === "string" ? (sub![k] as string) : fail(`subject.${k} must be a string`);
    level.subject = {
      id: text("id"),
      name: text("name"),
      theme: text("theme"),
      lore: text("lore"),
    };
  }
  if (o.seals !== undefined) {
    if (!Array.isArray(o.seals)) fail("seals must be an array");
    level.seals = (o.seals as unknown[]).map((v, i): SealSpec => {
      const ss = v as Record<string, unknown> | null;
      if (
        !ss ||
        typeof ss.key !== "number" ||
        !Array.isArray(ss.cells) ||
        !ss.cells.every((c) => typeof c === "number")
      )
        fail(`seals[${i}] must be {key, cells}`);
      return { key: ss!.key as number, cells: (ss!.cells as number[]).slice() };
    });
  }
  if (o.shades !== undefined) {
    const sh = o.shades as Record<string, unknown> | null;
    const nums = (v: unknown, k: string) =>
      Array.isArray(v) && v.every((x) => typeof x === "number")
        ? (v as number[])
        : fail(`shades.${k} must be an array of numbers`);
    if (!sh || typeof sh !== "object") fail("shades must be an object");
    const colors = sh!.colors;
    if (!Array.isArray(colors) || !colors.every((x) => typeof x === "string"))
      fail("shades.colors must be an array of strings");
    level.shades = {
      colors: colors as string[],
      family: nums(sh!.family, "family"),
      cells: nums(sh!.cells, "cells"),
    };
  }
  const errors = validateCollectLevel(level);
  if (errors.length > 0) fail(errors.join("; "));
  return level;
}
