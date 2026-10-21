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
  /** Number of `step` calls so far. */
  step: number;
  status: Status;
}

export type SimEvent =
  | { type: "launched"; wispId: number; from: LaunchSource }
  | { type: "collected"; wispId: number; cell: number; color: number; chargeLeft: number }
  | { type: "portal"; wispId: number }
  | { type: "parked"; wispId: number; slot: number }
  | { type: "won" }
  | { type: "lost"; wispId: number };

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
    columns: level.columns.map((col) => col.map((w) => ({ id: nextId++, ...w }))),
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
  s.track.push({ ...wisp, pos: 0, traveled: 0 });
  return { type: "launched", wispId: wisp.id, from: source };
}

/**
 * Advances the simulation by one step: every track wisp moves one cell, then, front-most first,
 * each either finishes its lap (parks in a slot, or loses the game if none is free) or collects the
 * first fragment in its line of sight when the color matches. A wisp reaching charge 0 leaves
 * through the portal.
 */
export function step(s: SimState): SimEvent[] {
  if (s.status !== "playing") return [];
  const track = trackFor(s.width, s.height);
  const lap = track.length;
  const events: SimEvent[] = [];
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
        events.push({ type: "lost", wispId: w.id });
        stillOnTrack.push(w);
      } else {
        s.slots[slot] = { id: w.id, color: w.color, charge: w.charge };
        events.push({ type: "parked", wispId: w.id, slot });
      }
      continue;
    }
    const sight = track[w.pos]!.sight;
    const target = sight ? firstInSight(s.cells, sight) : -1;
    if (target !== -1 && s.cells[target] === w.color) {
      s.cells[target] = EMPTY;
      s.remaining--;
      w.charge--;
      events.push({
        type: "collected",
        wispId: w.id,
        cell: target,
        color: w.color,
        chargeLeft: w.charge,
      });
      if (w.charge === 0) {
        events.push({ type: "portal", wispId: w.id });
        if (s.remaining === 0) {
          s.status = "won";
          events.push({ type: "won" });
        }
        continue;
      }
    }
    stillOnTrack.push(w);
  }
  s.track = stillOnTrack;
  return events;
}

/** Steps until the track is empty or the game ends. Returns all events. */
export function runUntilIdle(s: SimState, maxSteps = 100_000): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < maxSteps && s.status === "playing" && s.track.length > 0; i++) {
    events.push(...step(s));
  }
  return events;
}
