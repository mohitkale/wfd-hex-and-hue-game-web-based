import { openCell, routeTo } from "./grid";
import { legalActions, queueCanProgress } from "./actions";
import type { CollectEvent } from "./events";
import { cachesOf, topologyOf, type CollectState, type Familiar } from "./state";
import { hasAssignable, nearestTarget } from "./targeting";
import { EMPTY } from "../level";
import { remaining, uncommitted } from "./groups";

/** True when no familiar exists and no group is working (GAME_DESIGN_V2 §2). */
export function isSettled(s: CollectState): boolean {
  return s.familiars.length === 0 && !s.groups.some((g) => g.status === "working");
}

function familiarCount(s: CollectState, group: number): number {
  let n = 0;
  for (const f of s.familiars) if (f.group === group) n++;
  return n;
}

/** Phase 1 for one familiar: its single action this tick. */
function act(s: CollectState, f: Familiar, events: CollectEvent[]): void {
  switch (f.status) {
    case "toCube": {
      const from = f.route[f.at]!;
      f.at++;
      events.push({
        type: "familiarMoved",
        familiar: f.id,
        from,
        to: f.route[f.at]!,
        carrying: false,
      });
      if (f.at === f.route.length - 1) f.status = "pickup";
      return;
    }
    case "pickup": {
      const t = topologyOf(s);
      const caches = cachesOf(s);
      const cell = f.cube;
      const color = s.grid[cell]!;
      s.grid[cell] = EMPTY;
      s.reserved[cell] = 0;
      caches.accessible[color]!.delete(cell);
      // The cell is open now: distances shrink, sealed pockets may join, and cubes next to any
      // newly reachable cell become accessible.
      for (const reached of openCell(t, s.grid, s.dist, cell)) {
        for (let k = 0; k < 4; k++) {
          const n = t.neighbors[reached * 4 + k]!;
          if (n >= 0 && s.grid[n]! !== EMPTY) caches.accessible[s.grid[n]!]!.add(n);
        }
      }
      events.push({ type: "cubePickedUp", familiar: f.id, cube: cell, color });
      f.status = f.route.length === 1 ? "deliver" : "carrying";
      return;
    }
    case "carrying": {
      const from = f.route[f.at]!;
      f.at--;
      events.push({
        type: "familiarMoved",
        familiar: f.id,
        from,
        to: f.route[f.at]!,
        carrying: true,
      });
      if (f.at === 0) f.status = "deliver";
      return;
    }
    case "deliver": {
      const g = s.groups[f.group]!;
      g.delivered++;
      g.committed--;
      s.deliveredTotal++;
      events.push({
        type: "cubeDelivered",
        familiar: f.id,
        group: g.id,
        color: g.color,
        remaining: remaining(g),
      });
      f.status = "idle";
      f.route = [];
      f.at = 0;
      f.cube = -1;
      return;
    }
    case "idle":
      return;
  }
}

/** Reserves `target` for `f` and sets it walking (or picking up, for a zero-move route). */
function assign(
  s: CollectState,
  f: Familiar,
  target: { cube: number; standing: number },
  events: CollectEvent[],
): number {
  f.route = routeTo(topologyOf(s), s.dist, target.standing);
  f.at = 0;
  f.cube = target.cube;
  f.status = f.route.length === 1 ? "pickup" : "toCube";
  s.reserved[target.cube] = 1;
  s.groups[f.group]!.committed++;
  events.push({ type: "cubeReserved", familiar: f.id, cube: target.cube });
  return f.route.length - 1;
}

/** Phase 2 for one working group: reassign or retire idle familiars, then maybe spawn. */
function dispatch(s: CollectState, groupId: number, events: CollectEvent[]): void {
  const g = s.groups[groupId]!;

  for (const f of s.familiars.filter((x) => x.group === groupId && x.status === "idle")) {
    const target = uncommitted(g) > 0 ? nearestTarget(s, g.color) : null;
    if (target) {
      assign(s, f, target, events);
    } else {
      s.familiars.splice(s.familiars.indexOf(f), 1);
      events.push({ type: "familiarRetired", familiar: f.id });
    }
  }

  if (s.tick >= g.nextSpawn && familiarCount(s, groupId) < s.params.squad && uncommitted(g) > 0) {
    const target = nearestTarget(s, g.color);
    if (target) {
      const f: Familiar = {
        id: s.nextFamiliarId++,
        group: groupId,
        status: "idle",
        route: [],
        at: 0,
        cube: -1,
      };
      s.familiars.push(f);
      const moves = assign(s, f, target, events);
      // `familiarSpawned` precedes its `cubeReserved`.
      events.splice(events.length - 1, 0, {
        type: "familiarSpawned",
        familiar: f.id,
        group: groupId,
        routeLength: moves,
      });
      g.nextSpawn = s.tick + s.params.spawnGap;
    }
  }
}

/**
 * Phase 3, pass 2: a working group with no familiar and no assignable cube parks in the lowest free
 * slot, or loses the game when none is free. Returns true when the game was lost (the pass stops
 * there and the state is frozen).
 */
function stall(s: CollectState, events: CollectEvent[]): boolean {
  for (const g of s.groups) {
    if (g.status !== "working") continue;
    if (familiarCount(s, g.id) > 0 || hasAssignable(s, g.color)) continue;
    const slot = s.slots.indexOf(null);
    if (slot === -1) {
      s.status = "lost";
      s.lossReason = "slotsFull";
      events.push({ type: "lost", reason: "slotsFull", group: g.id });
      return true;
    }
    s.slots[slot] = g.id;
    g.status = "waiting";
    events.push({ type: "groupParked", group: g.id, slot, remaining: remaining(g) });
  }
  return false;
}

/**
 * Phase 4: win is tested first, then a settled state with no legal action is a deadlock. With
 * `queue` (a player's game, not the solver's) a board is not dead while queueing a box into a free
 * tray could still expose one that can work (`queueCanProgress`).
 */
function updateStatus(s: CollectState, events: CollectEvent[], queue = false): void {
  if (s.deliveredTotal === s.cubesTotal) {
    s.status = "won";
    events.push({ type: "won" });
  } else if (isSettled(s) && legalActions(s).length === 0 && !(queue && queueCanProgress(s))) {
    s.status = "lost";
    s.lossReason = "deadlock";
    events.push({ type: "lost", reason: "deadlock", group: null });
  }
}

/**
 * Finishes the tick a `slotsFull` loss interrupted, after a slot was added (the Extra Slot booster,
 * docs/V2_BOOSTERS.md): the stalled group parks in the new slot, the rest of the pass and phase 4
 * run exactly as they would have. The tick counter is not advanced.
 */
export function reviveFromSlotsFull(s: CollectState): CollectEvent[] {
  const events: CollectEvent[] = [];
  s.status = "playing";
  s.lossReason = null;
  if (!stall(s, events)) updateStatus(s, events);
  return events;
}

/**
 * One tick (GAME_DESIGN_V2 §7). Phase 0 begin, 1 act, 2 dispatch, 3 resolve (complete, then
 * stall), 4 status. A no-op, returning no events, when the game is over or settled.
 */
export function step(s: CollectState, queue = false): CollectEvent[] {
  const events: CollectEvent[] = [];
  if (s.status !== "playing" || isSettled(s)) return events;
  s.tick++;

  // Phase 1: act (familiars in ascending id; spawned ones do not act on their spawn tick).
  for (const f of s.familiars.slice()) act(s, f, events);

  // Phase 2: dispatch, working groups in ascending id.
  for (const g of s.groups) if (g.status === "working") dispatch(s, g.id, events);

  // Phase 3, pass 1: complete.
  for (const g of s.groups) {
    if (g.status === "working" && g.delivered === g.capacity) {
      g.status = "completed";
      events.push({ type: "groupCompleted", group: g.id });
    }
  }
  // Phase 3, pass 2 and phase 4.
  if (stall(s, events)) return events;
  updateStatus(s, events, queue);
  return events;
}

/**
 * After a player's queue tap on a settled board: the game may now be dead (every tray used and
 * nothing can work), and no tick will say so because a settled board does not step.
 */
export function reassess(s: CollectState): CollectEvent[] {
  const events: CollectEvent[] = [];
  if (s.status === "playing") updateStatus(s, events, true);
  return events;
}

/** Steps until settled or the game ends (or `maxTicks`). Returns all events. */
export function runUntilSettled(s: CollectState, maxTicks = 100_000): CollectEvent[] {
  const events: CollectEvent[] = [];
  for (let i = 0; i < maxTicks && s.status === "playing" && !isSettled(s); i++) {
    events.push(...step(s));
  }
  return events;
}
