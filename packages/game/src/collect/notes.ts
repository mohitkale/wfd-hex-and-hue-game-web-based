import type * as collect from "@hexhue/core/collect";

/**
 * The reason behind something that just happened, in a few words (M14.2: explain *why* a move
 * succeeded or failed). A refused tap already says why (see `REASON_TEXT`); this covers the quieter
 * case of a group that ran dry and went to wait in a slot. Null for events that need no explaining.
 */
export function eventNote(e: collect.CollectEvent): string | null {
  if (e.type === "groupParked" && e.remaining > 0) return "It waits here and starts by itself";
  return null;
}
