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

/**
 * What a player's tap on a column does (M15.11). A box that cannot work yet (the working limit is
 * reached, or it has no cube it can reach, or only sealed ones) is **queued** into a free tray instead
 * of being refused: it waits there and the game resumes it by itself when it can work. Only when no
 * tray is free does the tap fail, with the reason it cannot work. Resuming a waiting box is never
 * queued. `explain`/`legalActions` stay the strict "can work now" rules, so the solver, hints and
 * measures are unchanged: queueing only adds options, never takes one away.
 */
export function explainTap(s: CollectState, a: Action): ActionCheck {
  const reason = explain(s, a);
  if (reason === "ok" || a.kind !== "select") return reason;
  if (reason === "gameOver" || reason === "unavailable") return reason;
  return s.slots.includes(null) ? "ok" : reason;
}

/**
 * Whether queueing could still get a stuck board moving: some column holds, at depth `d` (1 or more),
 * a box that can work now, and `d` trays are free to queue the boxes above it into. Queueing moves no
 * cube, so this does not change while nothing works. Used only by the player's loss rule (`step`'s
 * `queue` option), so a board is not called a deadlock while a queue tap would still help.
 */
export function queueCanProgress(s: CollectState): boolean {
  let free = 0;
  for (const slot of s.slots) if (slot === null) free++;
  if (free === 0) return false;
  for (const column of s.columns) {
    for (let depth = 1; depth < column.length && depth <= free; depth++) {
      if (hasAssignable(s, s.groups[column[depth]!]!.color)) return true;
    }
  }
  return false;
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
  return applyChecked(s, a);
}

/**
 * Applies a player's tap (`explainTap`): like `apply`, but a box that cannot work yet is queued in a
 * free tray. The session and replay use it; the solver and the simulated players use `apply`.
 */
export function applyTap(s: CollectState, a: Action): CollectEvent[] {
  const reason = explainTap(s, a);
  if (reason !== "ok") throw new IllegalActionError(reason, a);
  return applyChecked(s, a);
}

function applyChecked(s: CollectState, a: Action): CollectEvent[] {
  const events: CollectEvent[] = [];
  if (a.kind === "select") {
    const canWork = explain(s, a) === "ok";
    const id = s.columns[a.column]!.shift()!;
    const g = s.groups[id]!;
    events.push({ type: "groupSelected", group: id, column: a.column });
    if (canWork) {
      g.status = "working";
      g.nextSpawn = s.tick + 1;
    } else {
      // Queued: straight into the lowest free tray, to be resumed when it can work.
      const slot = s.slots.indexOf(null);
      s.slots[slot] = id;
      g.status = "waiting";
      events.push({ type: "groupParked", group: id, slot, remaining: g.capacity - g.delivered });
    }
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
