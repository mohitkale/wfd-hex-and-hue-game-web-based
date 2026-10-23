import { hasSealedAccessible } from "./seals";
import { hasAssignable } from "./targeting";
import type { CollectEvent } from "./events";
import type { CollectState } from "./state";

export type Action = { kind: "select"; column: number } | { kind: "resume"; slot: number };

/** Why an action is or is not allowed (docs/V2_PROTOTYPE_SPEC.md §3). */
export type ActionCheck =
  | "ok"
  /** The game is won or lost. */
  | "gameOver"
  /** Column out of range or empty, or slot empty or out of range. */
  | "unavailable"
  /** `fieldCap` groups are already working. */
  | "fieldFull"
  /** The group has no assignable cube right now. */
  | "noReachableCube"
  /** Its reachable cubes are all wax-sealed until a key colour is gathered (M13.4). */
  | "sealed";

export class IllegalActionError extends Error {
  constructor(
    readonly reason: Exclude<ActionCheck, "ok">,
    readonly action: Action,
  ) {
    super(`illegal action ${JSON.stringify(action)}: ${reason}`);
    this.name = "IllegalActionError";
  }
}

/** The group an action would open, or null if the column or slot holds none. */
function targetGroup(s: CollectState, a: Action): number | null {
  if (a.kind === "select") return s.columns[a.column]?.[0] ?? null;
  return s.slots[a.slot] ?? null;
}

export function explain(s: CollectState, a: Action): ActionCheck {
  if (s.status !== "playing") return "gameOver";
  const id = targetGroup(s, a);
  if (id === null) return "unavailable";
  let working = 0;
  for (const g of s.groups) if (g.status === "working") working++;
  if (working >= s.params.fieldCap) return "fieldFull";
  const color = s.groups[id]!.color;
  if (hasAssignable(s, color)) return "ok";
  return hasSealedAccessible(s, color) ? "sealed" : "noReachableCube";
}

/** Legal actions in the canonical order: column fronts by column, then waiting groups by slot. */
export function legalActions(s: CollectState): Action[] {
  const out: Action[] = [];
  s.columns.forEach((_, column) => {
    const a: Action = { kind: "select", column };
    if (explain(s, a) === "ok") out.push(a);
  });
  s.slots.forEach((_, slot) => {
    const a: Action = { kind: "resume", slot };
    if (explain(s, a) === "ok") out.push(a);
  });
  return out;
}

/** Applies a legal action (between ticks). Throws `IllegalActionError` otherwise. */
export function apply(s: CollectState, a: Action): CollectEvent[] {
  const reason = explain(s, a);
  if (reason !== "ok") throw new IllegalActionError(reason, a);
  const events: CollectEvent[] = [];
  if (a.kind === "select") {
    const id = s.columns[a.column]!.shift()!;
    const g = s.groups[id]!;
    g.status = "working";
    g.nextSpawn = s.tick + 1;
    events.push({ type: "groupSelected", group: id, column: a.column });
  } else {
    const id = s.slots[a.slot]!;
    s.slots[a.slot] = null;
    const g = s.groups[id]!;
    g.status = "working";
    g.nextSpawn = s.tick + 1;
    events.push(
      { type: "groupResumed", group: id, slot: a.slot },
      { type: "slotReleased", slot: a.slot },
    );
  }
  return events;
}
