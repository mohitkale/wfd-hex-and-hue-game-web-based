import { EMPTY, type Level } from "./level";
import { buildTrack, firstInSight, type TrackCell } from "./track";

/** A wisp in a summon column or holding slot. `id` is stable for the whole level. */
export interface Wisp {
  id: number;
  color: number;
  charge: number;
}

/** A wisp travelling on the track. `pos` indexes the track; `traveled` counts steps since launch. */
export interface TrackWisp extends Wisp {
  pos: number;
  traveled: number;
}

export type Status = "playing" | "won" | "lost";

export type LaunchSource = { kind: "column"; index: number } | { kind: "slot"; index: number };

/**
 * Complete, plain-data game state. Engine functions mutate it in place; use `cloneState` to keep
 * snapshots (undo, solver search).
 */
export interface SimState {
  width: number;
  height: number;
  cells: number[];
  /** Fragments left on the mosaic. */
  remaining: number;
  /** `columns[c][0]` is the front wisp. */
  columns: Wisp[][];
  slots: (Wisp | null)[];
  /** Front-most (longest travelled) first. */
  track: TrackWisp[];
  trackCap: number;
  /** Number of effective `step` calls so far. Informational only: exclude it from state hashes. */
  step: number;
  status: Status;
}

export type SimEvent =
  | { type: "launched"; wispId: number; from: LaunchSource }
  | {
      type: "collected";
      wispId: number;
      /** Track position the wisp collected from. */
      pos: number;
      cell: number;
      color: number;
      chargeLeft: number;
    }
  | { type: "portal"; wispId: number; pos: number }
  | { type: "parked"; wispId: number; slot: number }
  | { type: "won" }
  | { type: "lost"; wispId: number };

// Shared, never mutated; one small entry per board size used.
const trackCache = new Map<string, TrackCell[]>();

/** The (cached, shared, read-only) track for a mosaic size. */
export function trackFor(width: number, height: number): readonly TrackCell[] {
  const key = `${width}x${height}`;
  let track = trackCache.get(key);
  if (!track) {
    track = buildTrack(width, height);
    trackCache.set(key, track);
  }
  return track;
}

export function createState(level: Level): SimState {
  let nextId = 0;
  return {
    width: level.width,
    height: level.height,
    cells: level.cells.slice(),
    remaining: level.cells.filter((c) => c !== EMPTY).length,
    columns: level.columns.map((col) =>
      col.map((w) => ({ id: nextId++, color: w.color, charge: w.charge })),
    ),
    slots: new Array<Wisp | null>(level.slots).fill(null),
    track: [],
    trackCap: level.trackCap,
    step: 0,
    status: "playing",
  };
}

export function cloneState(s: SimState): SimState {
  return {
    ...s,
    cells: s.cells.slice(),
    columns: s.columns.map((col) => col.map((w) => ({ ...w }))),
    slots: s.slots.map((w) => (w ? { ...w } : null)),
    track: s.track.map((w) => ({ ...w })),
  };
}

/** The wisp a source would launch, if any. */
export function wispAt(s: SimState, source: LaunchSource): Wisp | null {
  return source.kind === "column"
    ? (s.columns[source.index]?.[0] ?? null)
    : (s.slots[source.index] ?? null);
}

/** True if the track can accept a wisp right now (entry free and below the track cap). */
export function entryOpen(s: SimState): boolean {
  return (
    s.status === "playing" &&
    s.track.length < s.trackCap &&
    !s.track.some((w) => w.pos === 0 && w.traveled === 0)
  );
}

export function canLaunch(s: SimState, source: LaunchSource): boolean {
  return entryOpen(s) && wispAt(s, source) !== null;
}

/** Puts the source's wisp on the track entry. Returns the event, or `null` if not allowed. */
export function launch(s: SimState, source: LaunchSource): SimEvent | null {
  if (!canLaunch(s, source)) return null;
  const wisp =
    source.kind === "column" ? s.columns[source.index]!.shift()! : (s.slots[source.index] as Wisp);
  if (source.kind === "slot") s.slots[source.index] = null;
  s.track.push({ id: wisp.id, color: wisp.color, charge: wisp.charge, pos: 0, traveled: 0 });
  return { type: "launched", wispId: wisp.id, from: source };
}

/**
 * Advances the simulation by one step: every track wisp moves one cell, then, front-most first,
 * each either finishes its lap (parks in a slot, or loses the game if none is free) or collects the
 * first fragment in its line of sight when the color matches. A wisp reaching charge 0 leaves
 * through the portal. The game is won once no fragments remain.
 *
 * On a loss the state freezes mid-step: wisps behind the losing one have moved but are not
 * processed (no collection), and all of them, including the losing wisp, stay on `track`.
 */
export function step(s: SimState): SimEvent[] {
  const events: SimEvent[] = [];
  advance(s, trackFor(s.width, s.height), events);
  return events;
}

/**
 * `step` without the per-call track lookup, and with optional event collection (`null` skips
 * building events entirely). Hot path for the solver and generator.
 */
export function advance(s: SimState, track: readonly TrackCell[], events: SimEvent[] | null): void {
  if (s.status !== "playing") return;
  const lap = track.length;
  s.step++;

  for (const w of s.track) {
    w.traveled++;
    w.pos = (w.pos + 1) % lap;
  }

  const stillOnTrack: TrackWisp[] = [];
  for (const w of s.track) {
    if (s.status !== "playing") {
      stillOnTrack.push(w);
      continue;
    }
    if (w.traveled >= lap) {
      const slot = s.slots.indexOf(null);
      if (slot === -1) {
        s.status = "lost";
        events?.push({ type: "lost", wispId: w.id });
        stillOnTrack.push(w);
      } else {
        s.slots[slot] = { id: w.id, color: w.color, charge: w.charge };
        events?.push({ type: "parked", wispId: w.id, slot });
      }
      continue;
    }
    if (collectAt(s, w, track, events)) stillOnTrack.push(w);
  }
  s.track = stillOnTrack;
  if (s.status === "playing" && s.remaining === 0) {
    s.status = "won";
    events?.push({ type: "won" });
  }
}

/**
 * The collection half of a step for one track wisp at its current position: collects the first
 * fragment in sight if the color matches. Returns false if the wisp spent its charge and left
 * through the portal. Shared by `advance` and the revive booster (which finishes a step that a
 * loss interrupted).
 */
export function collectAt(
  s: SimState,
  w: TrackWisp,
  track: readonly TrackCell[],
  events: SimEvent[] | null,
): boolean {
  const sight = track[w.pos]!.sight;
  const target = sight ? firstInSight(s.cells, sight) : -1;
  if (target === -1 || s.cells[target] !== w.color) return true;
  s.cells[target] = EMPTY;
  s.remaining--;
  w.charge--;
  events?.push({
    type: "collected",
    wispId: w.id,
    pos: w.pos,
    cell: target,
    color: w.color,
    chargeLeft: w.charge,
  });
  if (w.charge > 0) return true;
  events?.push({ type: "portal", wispId: w.id, pos: w.pos });
  return false;
}

/** Steps until the track is empty or the game ends, without building events. */
export function runQuiet(s: SimState, maxSteps = 100_000): void {
  const track = trackFor(s.width, s.height);
  for (let i = 0; i < maxSteps && s.status === "playing" && s.track.length > 0; i++) {
    advance(s, track, null);
  }
}

/** Steps until the track is empty or the game ends. Returns all events. */
export function runUntilIdle(s: SimState, maxSteps = 100_000): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < maxSteps && s.status === "playing" && s.track.length > 0; i++) {
    events.push(...step(s));
  }
  return events;
}
