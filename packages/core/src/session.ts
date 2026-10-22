import { addSlot, applyWand } from "./boosters";
import type { Level } from "./level";
import type { Rng } from "./rng";
import { shuffleColumns } from "./shuffle";
import {
  cloneState,
  createState,
  entryOpen,
  launch,
  step,
  type LaunchSource,
  type SimEvent,
  type SimState,
  type Status,
} from "./sim";

export type SessionEvent =
  | SimEvent
  | { type: "queued"; wispId: number }
  | { type: "undone"; reverted: SnapshotKind }
  | { type: "restarted" }
  | { type: "wand"; color: number; cells: number[]; spent: number[] }
  | { type: "slotAdded"; slot: number; revivedWispId: number | null }
  | { type: "shuffled" };

export type SessionListener = (event: SessionEvent) => void;

/** What created an undo snapshot: a launch tap, or a booster. */
export type SnapshotKind = "tap" | "wand" | "extraSlot" | "shuffle";

interface Snapshot {
  state: SimState;
  queue: number[];
  kind: SnapshotKind;
}

/**
 * Owns one play-through of a level: turns player taps into launches, advances the simulation on
 * `tick()`, keeps undo snapshots and reports everything as events for the renderer. The renderer
 * decides how often to tick (that is where 1× / 2× speed lives); the session never reads time.
 *
 * Renderer notes:
 * - `subscribe` is the canonical event channel; `tap`/`tick` also return their events for
 *   convenience (tests, scripted play). Use one or the other, not both.
 * - After `tick()`, `state` is already post-step. A track wisp moved from `(pos - 1) mod lap` to
 *   `pos`, except one with `traveled === 0`, which was just launched onto the entry.
 * - `state` is replaced (new object) on `undone` and `restarted`; re-read it after those events.
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

  /** Wisps waiting to launch (tapped while the entry was busy), first to launch first. A copy. */
  get pending(): readonly number[] {
    return this.queue.slice();
  }

  get canUndo(): boolean {
    return this.history.length > 0 && this.current.status !== "won";
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

  /**
   * Reverts the whole board to the moment of the last tap (including anything other wisps did
   * since). Works out of a lost game; refused once the level is won.
   */
  undo(): boolean {
    if (!this.canUndo) return false;
    const snap = this.history.pop();
    if (!snap) return false;
    this.current = snap.state;
    this.queue = snap.queue;
    this.emit([{ type: "undone", reverted: snap.kind }]);
    return true;
  }

  /** Magic Wand on `color`. Undoable. Returns false (and changes nothing) if it would do nothing. */
  wand(color: number): boolean {
    if (this.current.status !== "playing") return false;
    const snapshot: Snapshot = {
      state: cloneState(this.current),
      queue: this.queue.slice(),
      kind: "wand",
    };
    const result = applyWand(this.current, color);
    if (result.cells.length === 0) return false;
    this.history.push(snapshot);
    if (this.history.length > this.maxUndo) this.history.shift();
    this.queue = this.queue.filter((id) => !result.spent.includes(id));
    const events: SessionEvent[] = [{ type: "wand", color, ...result }];
    // `applyWand` may finish the level (status is re-read, not the narrowed "playing").
    if ((this.current.status as Status) === "won") events.push({ type: "won" });
    this.emit(events);
    return true;
  }

  /** Extra Slot: one more holding slot; revives a lost level. Undoable. */
  extraSlot(): boolean {
    if (this.current.status === "won") return false;
    this.pushHistory("extraSlot");
    const finished: SimEvent[] = [];
    const revived = addSlot(this.current, finished);
    this.emit([
      { type: "slotAdded", slot: this.current.slots.length - 1, revivedWispId: revived },
      ...finished,
    ]);
    return true;
  }

  /** Shuffle: re-deals the summon columns into a still-solvable order. Undoable. */
  shuffle(rng: Rng): boolean {
    if (this.current.status !== "playing") return false;
    const next = shuffleColumns(this.current, rng);
    if (!next) return false;
    this.pushHistory("shuffle");
    this.current = next;
    // Queued taps referred to the old order.
    this.queue = [];
    this.emit([{ type: "shuffled" }]);
    return true;
  }

  restart(): void {
    this.current = createState(this.level);
    this.queue = [];
    this.history = [];
    this.emit([{ type: "restarted" }]);
  }

  private pushHistory(kind: SnapshotKind = "tap"): void {
    this.history.push({ state: cloneState(this.current), queue: this.queue.slice(), kind });
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
    // Unreachable while the queue invariant holds (queued column wisps reach their column front in
    // queue order); dropping is safer for players than throwing inside the game loop.
    if (!source) return [];
    const event = launch(s, source);
    return event ? [event] : [];
  }

  private emit(events: SessionEvent[]): SessionEvent[] {
    const listeners = [...this.listeners];
    for (const e of events) for (const l of listeners) l(e);
    return events;
  }
}
