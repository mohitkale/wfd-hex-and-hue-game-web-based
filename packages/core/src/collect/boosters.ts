import type { CollectEvent } from "./events";
import { reassess, reviveFromSlotsFull } from "./sim";
import { cloneState, type CollectState } from "./state";

/**
 * The v2 boosters' rules (M14.4, docs/V2_BOOSTERS.md). Pure functions over the state: what a booster
 * costs and when it can be bought is the game layer's business, what it *does* is decided here.
 */

/**
 * Whether Extra Slot has any effect now: not once the game is won, and not after a deadlock (a slot
 * cannot undo one; Undo can), except with shared trays (M15.13), where a deadlock can be every tray
 * holding a stuck box while a column still has one that could work: a new tray then revives the game.
 */
export const canAddSlot = (s: Readonly<CollectState>): boolean =>
  s.status === "playing" ||
  (s.status === "lost" && s.lossReason === "slotsFull") ||
  (s.status === "lost" && s.lossReason === "deadlock" && trayRevives(s));

/** Shared trays only: whether one more tray would make a deadlocked game playable again. */
function trayRevives(s: Readonly<CollectState>): boolean {
  if (!s.params.sharedTrays) return false;
  const probe = cloneState(s as CollectState);
  widen(probe);
  probe.status = "playing";
  probe.lossReason = null;
  reassess(probe);
  return probe.status === "playing";
}

function widen(s: CollectState): void {
  s.params.slots++;
  // Shared trays: the new tray works like the others.
  if (s.params.sharedTrays) s.params.fieldCap++;
  s.slots.push(null);
}

/**
 * Extra Slot: adds one holding slot for the rest of the level. After a `slotsFull` loss it also
 * revives: the stalled group parks in the new slot and the tick it interrupted is finished. A
 * deadlock is refused (a slot cannot undo it; Undo can). Returns the events (empty when refused).
 */
export function addSlot(s: CollectState): CollectEvent[] {
  if (!canAddSlot(s)) return [];
  widen(s);
  const events: CollectEvent[] = [{ type: "slotAdded", slot: s.slots.length - 1 }];
  if (s.status === "lost" && s.lossReason === "slotsFull") events.push(...reviveFromSlotsFull(s));
  else if (s.status === "lost") {
    // A shared-tray deadlock that the new tray opens up (`canAddSlot` checked it).
    s.status = "playing";
    s.lossReason = null;
    events.push(...reassess(s));
  }
  return events;
}
