import { EMPTY } from "../cells";
import { computeDist, topologyFor } from "./grid";
import { sealGate } from "./seals";
import { cachesOf, type CollectState } from "./state";

/**
 * Checks the engine's invariants and returns a description of the first violation, or null.
 * Used by tests after every tick (GAME_DESIGN_V2 §5, §4a, R-18/R-19).
 */
export function violation(s: CollectState): string | null {
  const t = topologyFor(s.params.width, s.params.height);

  // dist equals a fresh BFS.
  const fresh = computeDist(
    t,
    s.grid,
    s.params.portal,
    s.params.edgeGate === true,
    s.params.edgeBias ?? 1,
  );
  for (let i = 0; i < fresh.length; i++) {
    if (fresh[i] !== s.dist[i]) return `dist[${i}] = ${s.dist[i]}, fresh BFS says ${fresh[i]}`;
  }

  // The accessible-cube cache equals a rebuild: cubes with at least one reachable neighbour.
  const accessible = cachesOf(s).accessible;
  for (let cell = 0; cell < s.grid.length; cell++) {
    const color = s.grid[cell]!;
    let reachable = false;
    if (color !== EMPTY) {
      for (let k = 0; k < 4; k++) {
        const n = t.neighbors[cell * 4 + k]!;
        if (n >= 0 && s.dist[n]! >= 0) reachable = true;
      }
    }
    const cached = color !== EMPTY && (accessible[color]?.has(cell) ?? false);
    if (cached !== reachable) return `accessible cache wrong for cell ${cell} (cached ${cached})`;
  }
  for (const [color, set] of accessible.entries()) {
    for (const cell of set)
      if (s.grid[cell] !== color) return `cache lists cell ${cell} under colour ${color}`;
  }

  // Reservations: one per cube, matching the familiars exactly.
  const seen = new Set<number>();
  let reservedCount = 0;
  for (const f of s.familiars) {
    if (f.cube === -1) {
      if (f.status !== "idle") return `familiar ${f.id} has no cube but is ${f.status}`;
      continue;
    }
    if (seen.has(f.cube)) return `cube ${f.cube} is reserved twice`;
    seen.add(f.cube);
    if (f.status === "carrying" || f.status === "deliver") {
      if (s.grid[f.cube] !== EMPTY) return `carried cube ${f.cube} is still on the board`;
    } else if (s.grid[f.cube] === EMPTY) {
      return `reserved cube ${f.cube} left the board before pickup`;
    }
    if (s.reserved[f.cube] !== 1 && s.grid[f.cube] !== EMPTY) return `cube ${f.cube} not flagged`;
  }
  for (let i = 0; i < s.reserved.length; i++) if (s.reserved[i] === 1) reservedCount++;
  const onBoardReserved = [...seen].filter((c) => s.grid[c] !== EMPTY).length;
  if (reservedCount !== onBoardReserved) return "reserved flags do not match familiars";

  // Seals (M13.4): a cube is reserved only while unsealed, and seals only lift, so no reserved cube is sealed.
  const sealed = sealGate(s);
  if (sealed) {
    for (let i = 0; i < s.reserved.length; i++)
      if (s.reserved[i] === 1 && sealed(i)) return `reserved cube ${i} is still sealed`;
  }

  // Capacity bookkeeping per group.
  for (const g of s.groups) {
    const mine = s.familiars.filter((f) => f.group === g.id && f.cube !== -1).length;
    if (g.committed !== mine) return `group ${g.id}: committed ${g.committed}, familiars ${mine}`;
    if (g.delivered + g.committed > g.capacity) return `group ${g.id} over capacity`;
    if (g.status === "completed" && g.delivered !== g.capacity)
      return `group ${g.id} completed early`;
    if (g.status === "queued" && !s.columns.some((c) => c.includes(g.id)))
      return `queued group ${g.id} is in no column`;
    if (g.status === "waiting" && !s.slots.includes(g.id))
      return `waiting group ${g.id} has no slot`;
  }
  if (
    s.slots.filter((x) => x !== null).length !==
    s.groups.filter((g) => g.status === "waiting").length
  )
    return "slots and waiting groups disagree";

  // Cube conservation: board + carried + delivered = total.
  let onBoard = 0;
  for (const c of s.grid) if (c !== EMPTY) onBoard++;
  const carried = s.familiars.filter(
    (f) => f.status === "carrying" || f.status === "deliver",
  ).length;
  if (onBoard + carried + s.deliveredTotal !== s.cubesTotal) {
    return `cubes: ${onBoard} on board + ${carried} carried + ${s.deliveredTotal} delivered != ${s.cubesTotal}`;
  }
  if (s.deliveredTotal !== s.groups.reduce((n, g) => n + g.delivered, 0))
    return "deliveredTotal drift";

  // R-18: per colour, uncommitted capacity of its groups == unreserved cubes on the board.
  const colors = new Set([...s.grid.filter((c) => c !== EMPTY), ...s.groups.map((g) => g.color)]);
  for (const color of colors) {
    let uncommitted = 0;
    for (const g of s.groups) {
      if (g.color === color) uncommitted += g.capacity - g.delivered - g.committed;
    }
    let free = 0;
    for (let i = 0; i < s.grid.length; i++) if (s.grid[i] === color && s.reserved[i] === 0) free++;
    if (uncommitted !== free)
      return `colour ${color}: uncommitted ${uncommitted} != unreserved ${free}`;
  }
  return null;
}
