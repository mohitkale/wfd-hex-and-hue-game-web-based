import type { CollectEvent } from "./events";
import { sealGate } from "./seals";
import type { CollectState, GroupState } from "./state";
import { hasAssignable } from "./targeting";

/**
 * The power-ups that change the game (M15.13, docs/V2_BOOSTERS.md). They keep the v2 loop: familiars
 * still come out of a tray, fetch one cube each and carry it to the hole. Pure functions over the
 * state; what a power-up costs is the game layer's business.
 */

/** How many of its next cubes a swept box's familiars fetch by flying over the picture. */
export const SWEEP_CUBES = 6;

/**
 * Familiar's Call: whether the box at `depth` (1 or more: behind the front) of `column` can be called
 * to the front now.
 */
export function canCall(s: Readonly<CollectState>, column: number, depth: number): boolean {
  const c = s.columns[column];
  return s.status === "playing" && c !== undefined && depth >= 1 && depth < c.length;
}

/** Familiar's Call: moves the box at `depth` of `column` to its front. Returns the events (empty if refused). */
export function callForward(s: CollectState, column: number, depth: number): CollectEvent[] {
  if (!canCall(s, column, depth)) return [];
  const c = s.columns[column]!;
  const [group] = c.splice(depth, 1);
  c.unshift(group!);
  return [{ type: "boxCalled", group: group!, column, from: depth }];
}

/** An unreserved, unsealed cube of `color` anywhere on the board (buried ones too). */
function anyCube(s: Readonly<CollectState>, color: number): boolean {
  const sealed = sealGate(s as CollectState);
  for (let i = 0; i < s.grid.length; i++)
    if (s.grid[i] === color && s.reserved[i] === 0 && !(sealed && sealed(i))) return true;
  return false;
}

/** Whether `g` can send a familiar out now: a reachable cube, or any cube while it is swept. */
export function canWork(s: Readonly<CollectState>, g: Readonly<GroupState>): boolean {
  if ((g.flying ?? 0) > 0) return anyCube(s, g.color);
  return hasAssignable(s as CollectState, g.color);
}

/**
 * Besom Sweep: whether box `group` can be swept now. It must sit in a tray (working or waiting) with
 * familiars still inside, not already be swept, and have a cube of its colour left to fly to.
 */
export function canSweep(s: Readonly<CollectState>, group: number): boolean {
  const g = s.groups[group];
  if (!g || s.status !== "playing") return false;
  if (g.status !== "working" && g.status !== "waiting") return false;
  if ((g.flying ?? 0) > 0 || g.capacity - g.delivered - g.committed <= 0) return false;
  return anyCube(s, g.color);
}

/**
 * Besom Sweep: the next `SWEEP_CUBES` familiars of box `group` fly over the picture, so they can fetch
 * cubes of its colour that other colours bury. A waiting box goes back to work (auto-resume picks it
 * up on the next tick). Returns the events (empty if refused).
 */
export function sweep(s: CollectState, group: number): CollectEvent[] {
  if (!canSweep(s, group)) return [];
  const g = s.groups[group]!;
  g.flying = Math.min(SWEEP_CUBES, g.capacity - g.delivered - g.committed);
  return [{ type: "boxSwept", group, cubes: g.flying }];
}

/**
 * Where a swept familiar goes: the unreserved, unsealed cube of `color` closest (in a straight line)
 * to the walkway, and the walkway cell it reaches it from. The familiar walks there through open
 * space only, like any other, and pulls the cube out from there even when other cubes bury it
 * (M15.13: familiars never travel over cubes). Ties: nearer the portal, then the smaller index.
 */
export function reachTarget(
  s: Readonly<CollectState>,
  color: number,
): { cube: number; standing: number; swept: true } | null {
  const { stride } = s.params;
  const rows = s.grid.length / stride;
  const sealed = sealGate(s as CollectState);
  let best: { cube: number; standing: number; swept: true } | null = null;
  let bestReach = Infinity;
  let bestDist = Infinity;
  for (let i = 0; i < s.grid.length; i++) {
    if (s.grid[i] !== color || s.reserved[i] !== 0 || (sealed && sealed(i))) continue;
    const cx = i % stride;
    const cy = Math.floor(i / stride);
    // The nearest walkway cell, searching outward ring by ring.
    for (let r = 1; r < Math.max(stride, rows) && r <= bestReach; r++) {
      let found = -1;
      let foundDist = Infinity;
      for (let y = cy - r; y <= cy + r; y++) {
        if (y < 0 || y >= rows) continue;
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || x >= stride) continue;
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          const c = y * stride + x;
          const d = s.dist[c]!;
          if (d >= 0 && d < foundDist) {
            foundDist = d;
            found = c;
          }
        }
      }
      if (found < 0) continue;
      if (r < bestReach || (r === bestReach && foundDist < bestDist)) {
        bestReach = r;
        bestDist = foundDist;
        best = { cube: i, standing: found, swept: true };
      }
      break;
    }
  }
  return best;
}
