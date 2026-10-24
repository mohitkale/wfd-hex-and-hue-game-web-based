import type { CollectEvent } from "./events";
import { reviveFromSlotsFull } from "./sim";
import type { CollectState } from "./state";

/**
 * The v2 boosters' rules (M14.4, docs/V2_BOOSTERS.md). Pure functions over the state: what a booster
 * costs and when it can be bought is the game layer's business, what it *does* is decided here.
 */

/**
 * Whether Extra Slot has any effect now: not once the game is won, and not after a deadlock (a slot
 * cannot undo one; Undo can).
 */
export const canAddSlot = (s: Readonly<CollectState>): boolean =>
  s.status === "playing" || (s.status === "lost" && s.lossReason === "slotsFull");

/**
 * Extra Slot: adds one holding slot for the rest of the level. After a `slotsFull` loss it also
 * revives: the stalled group parks in the new slot and the tick it interrupted is finished. A
 * deadlock is refused (a slot cannot undo it; Undo can). Returns the events (empty when refused).
 */
export function addSlot(s: CollectState): CollectEvent[] {
  if (!canAddSlot(s)) return [];
  s.params.slots++;
  s.slots.push(null);
  const events: CollectEvent[] = [{ type: "slotAdded", slot: s.slots.length - 1 }];
  if (s.status === "lost" && s.lossReason === "slotsFull") events.push(...reviveFromSlotsFull(s));
  return events;
}
