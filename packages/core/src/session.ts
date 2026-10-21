import type { Level } from "./level";
import {
  cloneState,
  createState,
  entryOpen,
  launch,
  step,
  type LaunchSource,
  type SimEvent,
  type SimState,
} from "./sim";

export type SessionEvent =
  SimEvent | { type: "queued"; wispId: number } | { type: "undone" } | { type: "restarted" };

export type SessionListener = (event: SessionEvent) => void;

interface Snapshot {
  state: SimState;
  queue: number[];
}

/**
 * Owns one play-through of a level: turns player taps into launches, advances the simulation on
 * `tick()`, keeps undo snapshots and reports everything as events for the renderer. The renderer
 * decides how often to tick (that is where 1× / 2× speed lives); the session never reads time.
 */
export class GameSession {
  private current: SimState;
  /** Wisp ids tapped but not yet on the track, in launch order. */
  private queue: number[] = [];
  private history: Snapshot[] = [];
  private listeners = new Set<SessionListener>();

  constructor(
    readonly level: Level,
    private readonly maxUndo = 50,
  ) {
    this.current = createState(level);
  }

  get state(): Readonly<SimState> {
    return this.current;
  }

  /** Wisps waiting to launch (tapped while the entry was busy), first to launch first. */
  get pending(): readonly number[] {
    return this.queue;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * The wisp a tap on `source` would send: the front-most wisp of a column that isn't already
   * queued, or the wisp in a slot if it isn't already queued.
   */
  tapTarget(source: LaunchSource): number | null {
    const s = this.current;
    if (s.status !== "playing") return null;
    if (source.kind === "column") {
      const wisp = s.columns[source.index]?.find((w) => !this.queue.includes(w.id));
      return wisp?.id ?? null;
    }
    const wisp = s.slots[source.index];
    return wisp && !this.queue.includes(wisp.id) ? wisp.id : null;
  }

  /**
   * Player tapped a column or slot. The wisp launches immediately if the entry is free, otherwise
   * it is queued and launches as soon as possible. Returns the emitted events (empty if the tap did
   * nothing).
   */
  tap(source: LaunchSource): SessionEvent[] {
    const id = this.tapTarget(source);
    if (id === null) return [];
    this.pushHistory();
    this.queue.push(id);
    return this.emit([{ type: "queued", wispId: id }, ...this.launchQueued()]);
  }

  /** Advances one simulation step, then launches the next queued wisp if the entry is free. */
  tick(): SessionEvent[] {
    if (this.current.status !== "playing") return [];
    const events: SessionEvent[] = step(this.current);
    if (this.current.status === "playing") events.push(...this.launchQueued());
    else this.queue = [];
    return this.emit(events);
  }

  /** Reverts to just before the last tap. */
  undo(): boolean {
    const snap = this.history.pop();
    if (!snap) return false;
    this.current = snap.state;
    this.queue = snap.queue;
    this.emit([{ type: "undone" }]);
    return true;
  }

  restart(): void {
    this.current = createState(this.level);
    this.queue = [];
    this.history = [];
    this.emit([{ type: "restarted" }]);
  }

  private pushHistory(): void {
    this.history.push({ state: cloneState(this.current), queue: this.queue.slice() });
    if (this.history.length > this.maxUndo) this.history.shift();
  }

  private launchQueued(): SimEvent[] {
    const s = this.current;
    const id = this.queue[0];
    if (id === undefined || !entryOpen(s)) return [];
    const column = s.columns.findIndex((col) => col[0]?.id === id);
    const slot = s.slots.findIndex((w) => w?.id === id);
    const source: LaunchSource | null =
      column !== -1
        ? { kind: "column", index: column }
        : slot !== -1
          ? { kind: "slot", index: slot }
          : null;
    this.queue.shift();
    if (!source) return [];
    const event = launch(s, source);
    return event ? [event] : [];
  }

  private emit(events: SessionEvent[]): SessionEvent[] {
    for (const e of events) for (const l of this.listeners) l(e);
    return events;
  }
}
