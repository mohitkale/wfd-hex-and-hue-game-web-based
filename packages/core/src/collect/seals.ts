import type { CollectLevel } from "./level";
import { cachesOf, createCollectState, type CollectState } from "./state";

/**
 * Sealed cubes (M13.4, docs/V2_VARIETY.md): a cube can carry a wax seal of a **key** colour. A sealed
 * cube is still a cube (it blocks, it counts, it must be delivered) but no familiar may fetch it
 * until every group of its key colour has completed. Nothing else changes.
 *
 * Why this and not a lock on a whole colour: a locked colour only removes options, so it cannot trap
 * anyone. A seal on *some* of a colour's cubes lets that colour's group start, deliver what is not
 * sealed and then run dry with capacity left, so it waits in a slot until the key colour is done:
 * the slot pressure that makes the settled-sequential game a puzzle.
 *
 * Seals only ever lift (a completed group stays completed), so the invariants of §4a hold, and at a
 * settled state "every group of the key completed" is a function of the solver's state key (no
 * queued or waiting group of that colour remains), so the solver needs no new state.
 */

/** True once every group of `key` has completed. */
export function keyCleared(s: CollectState, key: number): boolean {
  for (const g of s.groups) if (g.color === key && g.status !== "completed") return false;
  return true;
}

/**
 * A test for "this padded cell holds a cube that is sealed right now", or `null` on a level without
 * seals (so ordinary levels pay nothing). Compute it once per query, not per cube.
 */
export function sealGate(s: CollectState): ((cell: number) => boolean) | null {
  const keys = cachesOf(s).sealKey;
  if (!keys) return null;
  const closed = new Map<number, boolean>();
  return (cell) => {
    const key = keys.get(cell);
    if (key === undefined || s.grid[cell]! < 0) return false;
    let shut = closed.get(key);
    if (shut === undefined) {
      shut = !keyCleared(s, key);
      closed.set(key, shut);
    }
    return shut;
  };
}

/** Padded cells of the cubes still sealed, in ascending order (for drawing). */
export function sealedCells(s: CollectState): number[] {
  const gate = sealGate(s);
  if (!gate) return [];
  const out: number[] = [];
  for (const cell of cachesOf(s).sealKey!.keys()) if (gate(cell)) out.push(cell);
  return out.sort((a, b) => a - b);
}

/** The key colour sealing a padded cell, whether or not it is still shut (for drawing the mark). */
export const sealKeyAt = (s: CollectState, cell: number): number | null =>
  cachesOf(s).sealKey?.get(cell) ?? null;

/**
 * Sealed cubes a group of `color` could reach right now if only the seal were off: reachable,
 * unreserved cubes of the colour that are sealed. Non-zero is why a tap is refused as "sealed".
 */
export function hasSealedAccessible(s: CollectState, color: number): boolean {
  const gate = sealGate(s);
  if (!gate) return false;
  const set = cachesOf(s).accessible[color];
  if (!set) return false;
  for (const cube of set) if (s.reserved[cube] === 0 && gate(cube)) return true;
  return false;
}

/** How many sealed cubes are reachable at the opening: the seals a player meets straight away. */
export function openingSealed(level: CollectLevel): number {
  const s = createCollectState(level);
  const sealed = sealGate(s);
  if (!sealed) return 0;
  let n = 0;
  for (const set of cachesOf(s).accessible) for (const cube of set) if (sealed(cube)) n++;
  return n;
}
