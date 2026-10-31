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

/**
 * Row order (M15.13, `CollectLevel.rowTargets`), after the reference game. A colour is worked from two
 * fronts: the **bottom front** (the lowest row holding a cube of `color` the familiars can reach, in
 * the lower half of the board) and the **top front** (the highest such row in the upper half, reached
 * along the side and top edges and worked downward). Picks alternate between the fronts when both
 * exist. In a front, most picks take its first row and about a third the row after it (so rows of one
 * colour are not finished strictly one by one), and in a row the cube nearest the board's centre on one
 * side, the sides taking turns (the other side when one has none). `turn` counts the group's picks.
 * The standing cell is the cube's nearest reachable neighbour, as for `nearestTarget`.
 */
export function rowTarget(s: CollectState, color: number, turn: number): Target | null {
  const set = cachesOf(s).accessible[color];
  if (!set) return null;
  const t = topologyOf(s);
  const sealed = sealGate(s);
  const stride = s.params.stride;
  const centre = (stride - 1) / 2;
  const mid = (t.rows - 1) / 2;
  // Rows of reachable cubes, by y.
  const rows = new Map<number, number[]>();
  for (const cube of set) {
    if (s.reserved[cube] === 1 || (sealed && sealed(cube))) continue;
    const y = Math.floor(cube / stride);
    const row = rows.get(y);
    if (row) row.push(cube);
    else rows.set(y, [cube]);
  }
  if (rows.size === 0) return null;
  const ys = [...rows.keys()];
  const bottom = ys.filter((y) => y >= mid).sort((a, b) => b - a);
  const top = ys.filter((y) => y < mid).sort((a, b) => a - b);
  const useTop = top.length > 0 && (bottom.length === 0 || turn % 2 === 1);
  const front = useTop ? top : bottom.length > 0 ? bottom : top;
  const k = Math.floor(turn / 2);
  const y = front[k % 3 === 2 && front.length > 1 ? 1 : 0]!;
  const row = rows.get(y)!;
  const left = k % 2 === 0;
  // Rank: the preferred side first, then nearer the centre, then the smaller index.
  const rank = (cube: number) => {
    const dx = (cube % stride) - centre;
    const onSide = left ? dx <= 0 : dx >= 0;
    return [onSide ? 0 : 1, Math.abs(dx), cube] as const;
  };
  let cube = row[0]!;
  let best = rank(cube);
  for (const c of row) {
    const r = rank(c);
    if (
      r[0] < best[0] ||
      (r[0] === best[0] && (r[1] < best[1] || (r[1] === best[1] && r[2] < best[2])))
    ) {
      cube = c;
      best = r;
    }
  }
  let standing = -1;
  let d = -1;
  for (let k2 = 0; k2 < 4; k2++) {
    const n = t.neighbors[cube * 4 + k2]!;
    if (n < 0) continue;
    const nd = s.dist[n]!;
    if (nd >= 0 && (d === -1 || nd < d || (nd === d && n < standing))) {
      d = nd;
      standing = n;
    }
  }
  return standing === -1 ? null : { cube, standing, distance: d };
}

/** True if at least one assignable cube of `color` exists. */
export function hasAssignable(s: CollectState, color: number): boolean {
  const set = cachesOf(s).accessible[color];
  if (!set) return false;
  const sealed = sealGate(s);
  for (const cube of set) if (s.reserved[cube] === 0 && !(sealed && sealed(cube))) return true;
  return false;
}
