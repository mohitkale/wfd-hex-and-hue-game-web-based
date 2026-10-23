import { sealGate } from "./seals";
import { cachesOf, topologyOf, type CollectState } from "./state";

/** What a group's next familiar goes for (GAME_DESIGN_V2 §4). */
export interface Target {
  /** Padded index of the cube's cell. */
  cube: number;
  /** Padded index of the reachable neighbour the familiar picks it up from. */
  standing: number;
  /** Walking distance from the portal to `standing`. */
  distance: number;
}

/**
 * The assignable cube (accessible, unreserved, of `color`) nearest the portal, with its standing
 * cell. Distance of a cube = smallest `dist` over its reachable neighbours. Ties go to the smaller
 * padded index (smaller y, then smaller x), both for the cube and for the standing cell.
 */
export function nearestTarget(s: CollectState, color: number): Target | null {
  const set = cachesOf(s).accessible[color];
  if (!set) return null;
  const t = topologyOf(s);
  const sealed = sealGate(s);
  let best: Target | null = null;
  for (const cube of set) {
    if (s.reserved[cube] === 1 || (sealed && sealed(cube))) continue;
    let standing = -1;
    let d = -1;
    for (let k = 0; k < 4; k++) {
      const n = t.neighbors[cube * 4 + k]!;
      if (n < 0) continue;
      const nd = s.dist[n]!;
      if (nd >= 0 && (d === -1 || nd < d || (nd === d && n < standing))) {
        d = nd;
        standing = n;
      }
    }
    if (standing === -1) continue; // cannot happen: members of the set have a reachable neighbour
    if (best === null || d < best.distance || (d === best.distance && cube < best.cube)) {
      best = { cube, standing, distance: d };
    }
  }
  return best;
}

/** True if at least one assignable cube of `color` exists. */
export function hasAssignable(s: CollectState, color: number): boolean {
  const set = cachesOf(s).accessible[color];
  if (!set) return false;
  const sealed = sealGate(s);
  for (const cube of set) if (s.reserved[cube] === 0 && !(sealed && sealed(cube))) return true;
  return false;
}
