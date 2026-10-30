import { applyTap, explainTap, IllegalActionError, type Action, type ActionCheck } from "./actions";
import type { CollectEvent, TickBatch } from "./events";
import { validateCollectLevel, type CollectLevel } from "./level";
import { autoResume } from "./autoResume";
import { addSlot, canAddSlot } from "./boosters";
import { callForward, canCall, canSweep, sweep } from "./powers";
import { isSettled, reassess, step } from "./sim";
import { cloneState, createCollectState, type CollectState } from "./state";

/** An applied action: `tick` is `state.tick` at the moment it was applied (between ticks). */
export interface LogEntry {
  tick: number;
  action: Action;
  /** Applied by the game itself (auto-resume), not tapped by the player. */
  auto?: boolean;
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
    push(before + 1, step(state, true));
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
      push(state.tick, [...applyTap(state, { ...entry.action }), ...reassess(state)]);
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
  /** Slots gained from the Extra Slot booster this attempt; they survive Undo, not Retry. */
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
    /** The game's own policy: waiting groups go back to work by themselves (docs/V2_AUTORESUME.md). */
    private readonly autoResumeOn = false,
  ) {
    const errors = validateCollectLevel(level);
    if (errors.length > 0) throw new Error(`Invalid level: ${errors.join("; ")}`);
    this.current = createCollectState(level);
  }

  get state(): Readonly<CollectState> {
    return this.current;
  }

  /**
   * The effective action log (truncated by undo). It records select/resume only: after `addSlot()`
   * it no longer replays on the plain level (the slot count differs), so anything that replays a log
   * must also apply `extraSlots` first.
   */
  get log(): readonly LogEntry[] {
    return this.entries.slice();
  }

  /** Whether this session plays the game's own policy (waiting groups resume by themselves). */
  get autoResume(): boolean {
    return this.autoResumeOn;
  }

  /** How many moves the player made (taps), not counting the ones the game applied by itself. */
  get moves(): number {
    return this.entries.filter((e) => !e.auto).length;
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
    return explainTap(this.current, action);
  }

  /** Applies a player action between ticks. An illegal action changes nothing and costs nothing. */
  tap(action: Action): { ok: boolean; reason: ActionCheck; events: CollectEvent[] } {
    const reason = explainTap(this.current, action);
    if (reason !== "ok") return { ok: false, reason, events: [] };
    this.history.push({ state: cloneState(this.current), logLength: this.entries.length });
    if (this.history.length > this.maxUndo) this.history.shift();
    const events = [...applyTap(this.current, action), ...reassess(this.current)];
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
    const events = step(this.current, true);
    if (this.autoResumeOn) {
      // Between ticks: a waiting group with a cube it can reach goes back to work at once.
      for (const r of autoResume(this.current)) {
        this.entries.push({ tick: this.current.tick, action: { ...r.action }, auto: true });
        events.push(...r.events);
      }
    }
    if (this.current.tick === before && events.length === 0) return null;
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
      if (snap.state.params.sharedTrays) snap.state.params.fieldCap++;
      snap.state.slots.push(null);
    }
    this.extra++;
    const events = addSlot(this.current);
    this.emit({ tick: this.current.tick, events });
    return true;
  }

  /**
   * Familiar's Call (M15.13): the box at `depth` of `column` moves to the front. One Undo takes it
   * back. Returns false when it has no effect. The caller charges for it.
   */
  callForward(column: number, depth: number): boolean {
    if (!canCall(this.current, column, depth)) return false;
    this.snapshot();
    const events = [...callForward(this.current, column, depth), ...reassess(this.current)];
    this.emit({ tick: this.current.tick, events });
    return true;
  }

  /** Whether Besom Sweep can be cast on box `group` now. */
  canSweep(group: number): boolean {
    return canSweep(this.current, group);
  }

  /**
   * Besom Sweep (M15.13): the next familiars of box `group` fly over the picture. One Undo takes it
   * back. Returns false when it has no effect. The caller charges for it.
   */
  sweep(group: number): boolean {
    if (!canSweep(this.current, group)) return false;
    this.snapshot();
    const events = sweep(this.current, group);
    this.emit({ tick: this.current.tick, events });
    return true;
  }

  private snapshot(): void {
    this.history.push({ state: cloneState(this.current), logLength: this.entries.length });
    if (this.history.length > this.maxUndo) this.history.shift();
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

  /** A fresh attempt: nothing bought during the last one (extra slots included) carries over (M15.13). */
  restart(): void {
    this.current = createCollectState(this.level);
    this.extra = 0;
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
