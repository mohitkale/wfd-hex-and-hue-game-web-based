import { remaining } from "./groups";
import type { CollectState } from "./state";

/** What a UI needs to draw one holding slot. */
export interface SlotView {
  slot: number;
  /** The waiting group's id, or null if the slot is free. */
  group: number | null;
  color: number | null;
  /** The number on the waiting group, or null if the slot is free. */
  remaining: number | null;
}

/** All slots in order, derived from the state. */
export function slotViews(s: Readonly<CollectState>): SlotView[] {
  return s.slots.map((id, slot) => {
    if (id === null) return { slot, group: null, color: null, remaining: null };
    const g = s.groups[id]!;
    return { slot, group: id, color: g.color, remaining: remaining(g) };
  });
}

/** The slot a group would park in now (the lowest free one), or -1 if all are taken. */
export const firstFreeSlot = (s: Readonly<CollectState>): number => s.slots.indexOf(null);

/** Number of free slots. */
export const freeSlots = (s: Readonly<CollectState>): number =>
  s.slots.reduce<number>((n, x) => (x === null ? n + 1 : n), 0);
