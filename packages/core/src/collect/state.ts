import { EMPTY } from "../level";
import { computeDist, padCells, paddedIndex, topologyFor, type Topology } from "./grid";
import { defaultPortalX, type CollectLevel } from "./level";

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
  return { accessible };
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
  if (c) caches.set(copy, { accessible: c.accessible.map((set) => new Set(set)) });
  return copy;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Rebuilds a state from `JSON.parse` output. The shape is checked; `dist` and `reserved` are
 * recomputed from `grid` and the familiars, never trusted from storage.
 */
export function fromJSON(json: unknown): CollectState {
  const fail = (msg: string): never => {
    throw new Error(`Invalid collect state: ${msg}`);
  };
  if (!isRecord(json)) fail("not an object");
  const o = json as Record<string, unknown>;
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
    if (!(k in o)) fail(`missing ${k}`);
  }
  const s = JSON.parse(JSON.stringify(o)) as CollectState;
  if (!isRecord(s.params) || !Array.isArray(s.grid)) fail("bad params or grid");
  const t = topologyFor(s.params.width, s.params.height);
  if (s.grid.length !== t.stride * t.rows) fail("grid size does not match params");
  s.lossReason = s.lossReason ?? null;
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
