import { mergeSaves } from "./merge";
import { SAVE_VERSION, defaultSave, migrate, type SaveData } from "./schema";
import { withTimeout, type LoadResult, type SaveStore } from "./store";

export type SaveListener = (data: Readonly<SaveData>) => void;

export interface SaveOptions {
  /** Debounce for writes after a change. */
  delayMs?: number;
  /** A read that takes longer counts as failed (never blocks the game). */
  timeoutMs?: number;
}

const clone = (d: SaveData): SaveData => JSON.parse(JSON.stringify(d)) as SaveData;
const storedVersion = (r: LoadResult) =>
  r.status === "ok" && typeof (r.data as { version?: unknown })?.version === "number"
    ? (r.data as { version: number }).version
    : 0;

/**
 * The player's save: always available synchronously in memory, written to the store shortly after
 * each change, and flushed when the page is hidden or closed.
 *
 * Every write first re-reads storage and three-way merges (see `mergeSaves`), so another tab's
 * progress — or the real save after a failed first read — is never overwritten. Nothing is written
 * while there are no changes, or when the stored save comes from a newer build (no downgrades).
 */
export class SaveManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<SaveListener>();
  private dirty = false;
  private writing: Promise<void> | null = null;

  private constructor(
    private readonly store: SaveStore,
    private current: SaveData,
    /** What storage held when we last synced; the merge base. */
    private base: SaveData,
    private readOnly: boolean,
    private readonly delayMs: number,
    private readonly timeoutMs: number,
  ) {}

  static async load(store: SaveStore, options: SaveOptions = {}): Promise<SaveManager> {
    const { delayMs = 400, timeoutMs = 1500 } = options;
    const result = await withTimeout(store.load(), timeoutMs, { status: "error" } as LoadResult);
    const data = result.status === "ok" ? migrate(result.data) : defaultSave();
    const newer = storedVersion(result) > SAVE_VERSION;
    if (newer) console.warn("Save is from a newer version of the game; not writing over it.");
    return new SaveManager(store, data, clone(data), newer, delayMs, timeoutMs);
  }

  /** A save that only lives in memory (used if loading fails outright). */
  static inMemory(store: SaveStore): SaveManager {
    const data = defaultSave();
    return new SaveManager(store, data, clone(data), false, 400, 1500);
  }

  get data(): Readonly<SaveData> {
    return this.current;
  }

  get storeKind(): SaveStore["kind"] {
    return this.store.kind;
  }

  /** Applies a change and schedules a write. */
  update(change: (data: SaveData) => void): void {
    change(this.current);
    this.current = migrate(this.current); // keeps invariants (no negative coins, star range…)
    this.dirty = true;
    for (const l of this.listeners) l(this.current);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Writes pending changes now (merged with whatever storage holds). No-op when clean. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Serialize flushes so two can't interleave their read-merge-write.
    while (this.writing) await this.writing;
    if (!this.dirty || this.readOnly) return;
    this.writing = this.write();
    try {
      await this.writing;
    } finally {
      this.writing = null;
    }
  }

  private async write(): Promise<void> {
    const latest = await withTimeout(this.store.load(), this.timeoutMs, {
      status: "error",
    } as LoadResult);
    if (latest.status === "error") return; // Can't see storage: keep the change, try next flush.
    if (storedVersion(latest) > SAVE_VERSION) {
      this.readOnly = true;
      return;
    }
    const theirs = latest.status === "ok" ? migrate(latest.data) : defaultSave();
    const merged = mergeSaves(this.base, this.current, theirs);
    if (await this.store.save(merged)) {
      this.current = merged;
      this.base = clone(merged);
      this.dirty = false;
      for (const l of this.listeners) l(this.current);
    }
  }

  subscribe(listener: SaveListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
