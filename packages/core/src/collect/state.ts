import { EMPTY } from "../level";
import { computeDist, padCells, paddedIndex, topologyFor, type Topology } from "./grid";
import { defaultPortalX, type CollectLevel, type SealSpec } from "./level";

/** Level constants copied into the state so every function needs only the state. Never mutated. */
export interface CollectParams {
  width: number;
  height: number;
  /** `width + 2`. */
  stride: number;
  /** Padded index of the portal cell. */
  portal: number;
  slots: number;
  squad: number;
  spawnGap: number;
  fieldCap: number;
  /** Sealed cubes (M13.4) as padded cell indices; absent on levels without any, so older states are unchanged. */
  seals?: SealSpec[];
}

export type GroupStatus = "queued" | "working" | "waiting" | "completed";

export interface GroupState {
  id: number;
  color: number;
  capacity: number;
  delivered: number;
  /** Cubes reserved or carried by this group's familiars. */
  committed: number;
  status: GroupStatus;
  /** First tick at which the group may spawn a familiar. */
  nextSpawn: number;
}

export type FamiliarStatus = "toCube" | "pickup" | "carrying" | "deliver" | "idle";

export interface Familiar {
  /** Global monotonic counter, never reused. */
  id: number;
  group: number;
  status: FamiliarStatus;
  /** Padded indices from the portal to the standing cell, inclusive; `[]` when idle. */
  route: number[];
  /** Index into `route` of the current cell (0 = portal); 0 when idle. */
  at: number;
  /** Padded index of the reserved cube's cell; -1 when idle. */
  cube: number;
}

export type GameStatus = "playing" | "won" | "lost";

export interface CollectState {
  params: CollectParams;
  tick: number;
  status: GameStatus;
  lossReason: "slotsFull" | "deadlock" | null;
  /** Padded grid: colour index for a cube, `EMPTY` for open cells (ring and emptied). */
  grid: number[];
  /** Derived from `grid`: walking distance from the portal, or -1. */
  dist: number[];
  /** Derived from the familiars: 1 where a cube is reserved. */
  reserved: number[];
  groups: GroupState[];
  /** Queued group ids, front first. */
  columns: number[][];
  /** Group id or null; length `params.slots`. The only record of which slot holds which group. */
  slots: (number | null)[];
  /** Ascending id. */
  familiars: Familiar[];
  nextFamiliarId: number;
  deliveredTotal: number;
  cubesTotal: number;
}

export const topologyOf = (s: Pick<CollectState, "params">): Topology =>
  topologyFor(s.params.width, s.params.height);

export function createCollectState(level: CollectLevel): CollectState {
  const { width, height } = level;
  const stride = width + 2;
  const grid = padCells(width, height, level.cells);
  const portal = paddedIndex(stride, level.portalX ?? defaultPortalX(width), height);
  const groups: GroupState[] = [];
  const columns: number[][] = level.columns.map((col) =>
    col.map((g) => {
      const id = groups.length;
      groups.push({
        id,
        color: g.color,
        capacity: g.capacity,
        delivered: 0,
        committed: 0,
        status: "queued",
        nextSpawn: 0,
      });
      return id;
    }),
  );
  const t = topologyFor(width, height);
  return {
    params: {
      width,
      height,
      stride,
      portal,
      slots: level.slots,
      squad: level.squad,
      spawnGap: level.spawnGap,
      fieldCap: level.fieldCap,
      ...(level.seals && level.seals.length > 0
        ? {
            seals: level.seals.map((s) => ({
              key: s.key,
              cells: s.cells.map((c) => paddedIndex(stride, c % width, Math.floor(c / width))),
            })),
          }
        : {}),
    },
    tick: 0,
    status: "playing",
    lossReason: null,
    grid,
    dist: computeDist(t, grid, portal),
    reserved: new Array<number>(grid.length).fill(0),
    groups,
    columns,
    slots: new Array<number | null>(level.slots).fill(null),
    familiars: [],
    nextFamiliarId: 0,
    deliveredTotal: 0,
    cubesTotal: level.cells.filter((c) => c !== EMPTY).length,
  };
}

// ---------------------------------------------------------------------------------------------
// Derived caches: per-colour sets of accessible cubes (GAME_DESIGN_V2 §4a). Held outside the
// serialised state, rebuilt on first use, copied by `cloneState`.
// ---------------------------------------------------------------------------------------------

export interface Caches {
  /** `accessible[color]` = cube cells (padded) with at least one reachable neighbour. */
  accessible: Set<number>[];
  /** Padded cell → key colour of its seal, or null on a level without seals. Never changes. */
  sealKey: Map<number, number> | null;
}

const caches = new WeakMap<CollectState, Caches>();

function buildCaches(s: CollectState): Caches {
  const t = topologyOf(s);
  let colors = 0;
  for (const c of s.grid) if (c + 1 > colors) colors = c + 1;
  for (const g of s.groups) if (g.color + 1 > colors) colors = g.color + 1;
  const accessible = Array.from({ length: colors }, () => new Set<number>());
  for (let cell = 0; cell < s.grid.length; cell++) {
    const color = s.grid[cell]!;
    if (color === EMPTY) continue;
    for (let k = 0; k < 4; k++) {
      const n = t.neighbors[cell * 4 + k]!;
      if (n >= 0 && s.dist[n]! >= 0) {
        accessible[color]!.add(cell);
        break;
      }
    }
  }
  let sealKey: Map<number, number> | null = null;
  if (s.params.seals) {
    sealKey = new Map();
    for (const seal of s.params.seals) for (const cell of seal.cells) sealKey.set(cell, seal.key);
  }
  return { accessible, sealKey };
}

/** The caches of `s`, built from `grid` and `dist` on first use. */
export function cachesOf(s: CollectState): Caches {
  let c = caches.get(s);
  if (!c) {
    c = buildCaches(s);
    caches.set(s, c);
  }
  return c;
}

export function cloneState(s: CollectState): CollectState {
  const copy: CollectState = {
    ...s,
    params: { ...s.params },
    grid: s.grid.slice(),
    dist: s.dist.slice(),
    reserved: s.reserved.slice(),
    groups: s.groups.map((g) => ({ ...g })),
    columns: s.columns.map((c) => c.slice()),
    slots: s.slots.slice(),
    familiars: s.familiars.map((f) => ({ ...f, route: f.route.slice() })),
  };
  const c = caches.get(s);
  if (c)
    caches.set(copy, { accessible: c.accessible.map((set) => new Set(set)), sealKey: c.sealKey });
  return copy;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

const GROUP_STATUSES: readonly string[] = ["queued", "working", "waiting", "completed"];
const FAMILIAR_STATUSES: readonly string[] = ["toCube", "pickup", "carrying", "deliver", "idle"];

/** Checks the shape and cross-references of a parsed state; throws a readable error. */
function checkShape(s: CollectState): void {
  const fail = (msg: string): never => {
    throw new Error(`Invalid collect state: ${msg}`);
  };
  const p = s.params;
  if (!isRecord(p)) fail("params must be an object");
  for (const k of ["width", "height", "slots", "squad", "spawnGap", "fieldCap"] as const) {
    if (!isInt(p[k]) || p[k] < 1) fail(`params.${k} must be an integer ≥ 1`);
  }
  if (p.width > 40 || p.height > 40) fail("params.width/height exceed 40");
  if (p.seals !== undefined) {
    if (
      !Array.isArray(p.seals) ||
      !p.seals.every(
        (v) =>
          isRecord(v) &&
          isInt(v.key) &&
          v.key >= 0 &&
          Array.isArray(v.cells) &&
          v.cells.every((c) => isInt(c) && c >= 0),
      )
    )
      fail("params.seals must be a list of {key, cells}");
  }
  if (p.stride !== p.width + 2) fail("params.stride must be width + 2");
  const cells = p.stride * (p.height + 2);
  if (!isInt(p.portal) || p.portal < 0 || p.portal >= cells) fail("params.portal out of range");
  if (!Array.isArray(s.grid) || s.grid.length !== cells) fail("grid size does not match params");
  s.grid.forEach((c, i) => {
    if (!isInt(c) || c < EMPTY) fail(`grid[${i}] must be an integer ≥ -1`);
  });
  if (s.grid[p.portal] !== EMPTY) fail("the portal cell holds a cube");
  if (!isInt(s.tick) || s.tick < 0) fail("tick must be an integer ≥ 0");
  if (!["playing", "won", "lost"].includes(s.status)) fail(`bad status ${String(s.status)}`);
  if (s.lossReason !== null && s.lossReason !== "slotsFull" && s.lossReason !== "deadlock")
    fail("bad lossReason");
  if (!isInt(s.cubesTotal) || !isInt(s.deliveredTotal) || !isInt(s.nextFamiliarId))
    fail("cubesTotal, deliveredTotal and nextFamiliarId must be integers");

  if (!Array.isArray(s.groups)) fail("groups must be an array");
  s.groups.forEach((g, i) => {
    if (!isRecord(g) || g.id !== i) fail(`groups[${i}].id must equal its index`);
    for (const k of ["color", "capacity", "delivered", "committed", "nextSpawn"] as const) {
      if (!isInt(g[k]) || g[k] < 0) fail(`groups[${i}].${k} must be an integer ≥ 0`);
    }
    if (g.capacity < 1) fail(`groups[${i}].capacity must be ≥ 1`);
    if (!GROUP_STATUSES.includes(g.status)) fail(`groups[${i}].status is invalid`);
  });
  const groupAt = (id: unknown, what: string): number => {
    if (!isInt(id) || id < 0 || id >= s.groups.length) fail(`${what} references a missing group`);
    return id as number;
  };

  if (!Array.isArray(s.columns)) fail("columns must be an array");
  s.columns.forEach((col, c) => {
    if (!Array.isArray(col)) fail(`columns[${c}] must be an array`);
    for (const id of col) {
      if (s.groups[groupAt(id, `columns[${c}]`)]!.status !== "queued")
        fail(`columns[${c}] holds a group that is not queued`);
    }
  });
  if (!Array.isArray(s.slots) || s.slots.length !== p.slots)
    fail("slots must be an array of length params.slots");
  s.slots.forEach((id, i) => {
    if (id !== null && s.groups[groupAt(id, `slots[${i}]`)]!.status !== "waiting")
      fail(`slots[${i}] holds a group that is not waiting`);
  });

  if (!Array.isArray(s.familiars)) fail("familiars must be an array");
  let lastId = -1;
  s.familiars.forEach((f, i) => {
    if (!isRecord(f) || !isInt(f.id) || f.id <= lastId)
      fail(`familiars[${i}] must have an id greater than the previous one`);
    lastId = f.id;
    if (f.id >= s.nextFamiliarId) fail("nextFamiliarId must exceed every familiar id");
    groupAt(f.group, `familiars[${i}]`);
    if (!FAMILIAR_STATUSES.includes(f.status)) fail(`familiars[${i}].status is invalid`);
    if (!Array.isArray(f.route) || !isInt(f.at) || !isInt(f.cube))
      fail(`familiars[${i}] has a malformed route, at or cube`);
    if (f.status === "idle") {
      if (f.route.length !== 0 || f.at !== 0 || f.cube !== -1)
        fail(`familiars[${i}] is idle but still holds a route or cube`);
      return;
    }
    if (f.route.length === 0 || f.route[0] !== p.portal)
      fail(`familiars[${i}].route must start at the portal`);
    if (f.at < 0 || f.at >= f.route.length) fail(`familiars[${i}].at is outside its route`);
    if (f.route.some((c) => !isInt(c) || c < 0 || c >= cells))
      fail(`familiars[${i}].route leaves the grid`);
    if (f.cube < 0 || f.cube >= cells) fail(`familiars[${i}].cube is out of range`);
    // A cube not yet picked up must still be on the board; a carried one must be gone.
    const carried = f.status === "carrying" || f.status === "deliver";
    if (carried === (s.grid[f.cube] !== EMPTY))
      fail(`familiars[${i}] (${f.status}) disagrees with the board about its cube`);
  });
}

/**
 * Rebuilds a state from `JSON.parse` output. Shape and cross-references are checked (throws
 * "Invalid collect state: …"); `dist` and `reserved` are recomputed from `grid` and the familiars,
 * never trusted from storage.
 */
export function fromJSON(json: unknown): CollectState {
  if (!isRecord(json)) throw new Error("Invalid collect state: not an object");
  for (const k of [
    "params",
    "tick",
    "status",
    "grid",
    "groups",
    "columns",
    "slots",
    "familiars",
    "nextFamiliarId",
    "deliveredTotal",
    "cubesTotal",
  ]) {
    if (!(k in json)) throw new Error(`Invalid collect state: missing ${k}`);
  }
  const s = JSON.parse(JSON.stringify(json)) as CollectState;
  s.lossReason = s.lossReason ?? null;
  checkShape(s);
  const t = topologyFor(s.params.width, s.params.height);
  s.dist = computeDist(t, s.grid, s.params.portal);
  s.reserved = new Array<number>(s.grid.length).fill(0);
  // A carried cube has left the board: only cubes still in place are reserved.
  for (const f of s.familiars) if (f.cube >= 0 && s.grid[f.cube] !== EMPTY) s.reserved[f.cube] = 1;
  return s;
}

// ---------------------------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------------------------

/** 53-bit string hash (cyrb53). */
function hashString(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Hash of the full logical state: everything except the derived `dist`, `reserved` and caches.
 * Two states with equal hashes behave identically from here on.
 */
export function hashState(s: CollectState): string {
  return hashString(
    JSON.stringify([
      s.params,
      s.tick,
      s.status,
      s.lossReason,
      s.grid,
      s.groups,
      s.columns,
      s.slots,
      s.familiars,
      s.nextFamiliarId,
      s.deliveredTotal,
      s.cubesTotal,
    ]),
  );
}

/**
 * Solver identity of a **settled** state (GAME_DESIGN_V2 §10): queued group counts per column, the
 * waiting groups as sorted (colour, remaining) pairs, and which cubes remain. Ignores tick, slot
 * numbers, routes and timers.
 */
export function stateKey(s: CollectState): string {
  let k = s.columns.map((c) => c.length).join(",") + "|";
  const waiting: string[] = [];
  for (const id of s.slots) {
    if (id === null) continue;
    const g = s.groups[id]!;
    waiting.push(`${g.color}:${g.capacity - g.delivered}`);
  }
  waiting.sort();
  k += waiting.join(",") + "|";
  let bits = 0;
  let n = 0;
  for (const c of s.grid) {
    bits = (bits << 1) | (c === EMPTY ? 0 : 1);
    if (++n === 16) {
      k += String.fromCharCode(bits);
      bits = 0;
      n = 0;
    }
  }
  return k + String.fromCharCode(bits);
}
