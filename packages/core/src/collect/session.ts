import { apply, explain, IllegalActionError, type Action, type ActionCheck } from "./actions";
import type { CollectEvent, TickBatch } from "./events";
import { validateCollectLevel, type CollectLevel } from "./level";
import { addSlot, canAddSlot } from "./boosters";
import { isSettled, step } from "./sim";
import { cloneState, createCollectState, type CollectState } from "./state";

/** An applied action: `tick` is `state.tick` at the moment it was applied (between ticks). */
export interface LogEntry {
  tick: number;
  action: Action;
}

/** A replay failed at `index`: an illegal action, or a tick the game could not reach. */
export class ReplayError extends Error {
  constructor(
    readonly index: number,
    message: string,
    options?: { cause: unknown },
  ) {
    super(`replay failed at log entry ${index}: ${message}`, options);
    this.name = "ReplayError";
  }
}

export interface ReplayResult {
  state: CollectState;
  /** Every event, in order. */
  events: CollectEvent[];
  /** The same events grouped per tick, and per applied action (tagged with the tick it happened at). */
  batches: TickBatch[];
}

/**
 * Re-plays an action log from the level start (docs/V2_PROTOTYPE_SPEC.md §3). Entries apply in
 * order: the game steps until `state.tick` equals the entry's tick, then the action is applied.
 * Without `untilTick` the game then runs to settled; with it, replay stops once `state.tick`
 * reaches it (actions at that tick are applied, later entries are ignored). Throws `ReplayError`
 * for an illegal entry, a decreasing tick, or a tick the game never reaches (it settled first).
 */
export function replay(
  level: CollectLevel,
  log: readonly LogEntry[],
  untilTick?: number,
): ReplayResult {
  const errors = validateCollectLevel(level);
  if (errors.length > 0) throw new Error(`Invalid level: ${errors.join("; ")}`);
  if (untilTick !== undefined && (!Number.isInteger(untilTick) || untilTick < 0)) {
    throw new Error(`untilTick must be a non-negative integer, got ${untilTick}`);
  }
  const state = createCollectState(level);
  const events: CollectEvent[] = [];
  const batches: TickBatch[] = [];
  const push = (tick: number, batch: CollectEvent[]) => {
    if (batch.length === 0) return;
    events.push(...batch);
    batches.push({ tick, events: batch });
  };
  const stepOnce = () => {
    const before = state.tick;
    push(before + 1, step(state));
  };

  for (const [index, entry] of log.entries()) {
    if (!Number.isInteger(entry.tick) || entry.tick < 0) {
      throw new ReplayError(index, `tick ${entry.tick} is not a non-negative integer`);
    }
    if (untilTick !== undefined && entry.tick > untilTick) break;
    if (entry.tick < state.tick) {
      throw new ReplayError(index, `tick ${entry.tick} is before the current tick ${state.tick}`);
    }
    while (state.tick < entry.tick) {
      if (state.status !== "playing" || isSettled(state)) {
        throw new ReplayError(
          index,
          `tick ${entry.tick} is never reached (the game settled at ${state.tick})`,
        );
      }
      stepOnce();
    }
    try {
      push(state.tick, apply(state, { ...entry.action }));
    } catch (e) {
      if (e instanceof IllegalActionError) throw new ReplayError(index, e.message, { cause: e });
      throw e;
    }
  }
  const limit = untilTick ?? Infinity;
  while (state.status === "playing" && !isSettled(state) && state.tick < limit) stepOnce();
  return { state, events, batches };
}

type Snapshot = { state: CollectState; logLength: number };

/**
 * Owns one play-through of a level (docs/V2_PROTOTYPE_SPEC.md §3): turns taps into actions, advances
 * the simulation on `tick()`, records the action log, keeps undo snapshots and reports everything
 * as per-tick event batches. The renderer decides how often to tick (that is where 1× / 2× lives);
 * the session never reads time.
 *
 * - `state` is replaced (a new object) on `undo()` and `restart()`; listen with `onReplace` and
 *   rebuild views from it.
 * - `subscribe` is the canonical event channel. `tap` and `tick` also return their events for
 *   convenience (tests, scripted play); use one or the other, not both.
 */
export class CollectSession {
  private current: CollectState;
  private entries: LogEntry[] = [];
  private history: Snapshot[] = [];
  /** Slots gained from the Extra Slot booster this level; they survive Undo and Retry. */
  private extra = 0;
  private listeners = new Set<(batch: TickBatch) => void>();
  private replaceListeners = new Set<(reason: "undo" | "restart") => void>();

  /**
   * @param maxUndo how many actions can be undone
   * @param onListenerError called when a subscriber throws. The default re-throws asynchronously
   *   (an unhandled rejection), so one broken view can neither desync the others nor make a
   *   completed `tap`/`tick` look as if it failed.
   */
  constructor(
    readonly level: CollectLevel,
    private readonly maxUndo = 50,
    private readonly onListenerError: (error: unknown) => void = (e) => {
      void Promise.reject(e);
    },
  ) {
    const errors = validateCollectLevel(level);
    if (errors.length > 0) throw new Error(`Invalid level: ${errors.join("; ")}`);
    this.current = createCollectState(level);
  }

  get state(): Readonly<CollectState> {
    return this.current;
  }

  /** The effective action log (truncated by undo). */
  get log(): readonly LogEntry[] {
    return this.entries.slice();
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  subscribe(listener: (batch: TickBatch) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called after `undo()` and `restart()` replace the state object. */
  onReplace(listener: (reason: "undo" | "restart") => void): () => void {
    this.replaceListeners.add(listener);
    return () => this.replaceListeners.delete(listener);
  }

  /** Why an action would or would not work right now (for the tap feedback). */
  check(action: Action): ActionCheck {
    return explain(this.current, action);
  }

  /** Applies a player action between ticks. An illegal action changes nothing and costs nothing. */
  tap(action: Action): { ok: boolean; reason: ActionCheck; events: CollectEvent[] } {
    const reason = explain(this.current, action);
    if (reason !== "ok") return { ok: false, reason, events: [] };
    this.history.push({ state: cloneState(this.current), logLength: this.entries.length });
    if (this.history.length > this.maxUndo) this.history.shift();
    const events = apply(this.current, action);
    this.entries.push({ tick: this.current.tick, action: { ...action } });
    this.emit({ tick: this.current.tick, events });
    return { ok: true, reason, events };
  }

  /**
   * Advances one tick. Returns the tick's batch, or null if nothing happened (the game is over or
   * settled: no tick elapses).
   */
  tick(): TickBatch | null {
    const before = this.current.tick;
    const events = step(this.current);
    if (this.current.tick === before) return null;
    const batch = { tick: this.current.tick, events };
    this.emit(batch);
    return batch;
  }

  /** How many holding slots the Extra Slot booster has added to this level. */
  get extraSlots(): number {
    return this.extra;
  }

  /** Whether Extra Slot would do anything (not once the game is won). */
  get canAddSlot(): boolean {
    return canAddSlot(this.current);
  }

  /**
   * Extra Slot booster: one more holding slot for the rest of the level, kept through Undo and Retry.
   * After a `slotsFull` loss it revives the game (docs/V2_BOOSTERS.md). Returns false when it has no
   * effect (the game is won). The caller charges for it; this changes the game only.
   */
  addSlot(): boolean {
    if (!canAddSlot(this.current)) return false;
    // Undo must not take the slot away: every earlier snapshot gains it too.
    for (const snap of this.history) {
      snap.state.params.slots++;
      snap.state.slots.push(null);
    }
    this.extra++;
    const events = addSlot(this.current);
    this.emit({ tick: this.current.tick, events });
    return true;
  }

  /** Restores the state before the last action (and drops it from the log). Works out of a loss. */
  undo(): boolean {
    const snap = this.history.pop();
    if (!snap) return false;
    this.current = snap.state;
    this.entries.length = snap.logLength;
    this.notifyReplace("undo");
    return true;
  }

  restart(): void {
    this.current = createCollectState(this.level);
    for (let i = 0; i < this.extra; i++) addSlot(this.current);
    this.entries = [];
    this.history = [];
    this.notifyReplace("restart");
  }

  private emit(batch: TickBatch): void {
    for (const l of [...this.listeners]) {
      try {
        l(batch);
      } catch (e) {
        this.onListenerError(e);
      }
    }
  }

  private notifyReplace(reason: "undo" | "restart"): void {
    for (const l of [...this.replaceListeners]) {
      try {
        l(reason);
      } catch (e) {
        this.onListenerError(e);
      }
    }
  }
}
