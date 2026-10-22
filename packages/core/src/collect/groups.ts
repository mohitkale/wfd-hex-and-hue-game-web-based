import type { CollectState, GroupState, GroupStatus } from "./state";

/** Cubes the group may still deliver: the number shown on it (GAME_DESIGN_V2 §5). */
export const remaining = (g: Pick<GroupState, "capacity" | "delivered">): number =>
  g.capacity - g.delivered;

/** Capacity not yet delivered and not yet committed to a familiar. */
export const uncommitted = (g: Pick<GroupState, "capacity" | "delivered" | "committed">): number =>
  g.capacity - g.delivered - g.committed;

/** What a UI needs to draw one group. */
export interface GroupView {
  id: number;
  color: number;
  /** The number on the group. It drops only when a cube is delivered. */
  remaining: number;
  capacity: number;
  status: GroupStatus;
  /** Column while queued, slot while waiting, otherwise null. */
  column: number | null;
  slot: number | null;
  /** Position in its column (0 = front) while queued, otherwise null. */
  depth: number | null;
  /** Familiars this group has out right now. */
  familiars: number;
}

/** A snapshot of every group for rendering; derived from the state, never stored in it. */
export function groupViews(s: Readonly<CollectState>): GroupView[] {
  return s.groups.map((g) => {
    let column: number | null = null;
    let depth: number | null = null;
    s.columns.forEach((col, c) => {
      const d = col.indexOf(g.id);
      if (d >= 0) {
        column = c;
        depth = d;
      }
    });
    const slot = s.slots.indexOf(g.id);
    return {
      id: g.id,
      color: g.color,
      remaining: remaining(g),
      capacity: g.capacity,
      status: g.status,
      column,
      slot: slot >= 0 ? slot : null,
      depth,
      familiars: s.familiars.filter((f) => f.group === g.id).length,
    };
  });
}
