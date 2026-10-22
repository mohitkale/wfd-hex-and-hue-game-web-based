import { migrate, type SaveData } from "./schema";
import type { SaveStore } from "./store";

export type SaveListener = (data: Readonly<SaveData>) => void;

/**
 * The player's save: always available synchronously in memory, written to the store shortly after
 * each change (debounced so a burst of updates is one write), and flushed immediately when the page
 * is hidden or closed.
 */
export class SaveManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<SaveListener>();

  private constructor(
    private readonly store: SaveStore,
    private current: SaveData,
    private readonly delayMs: number,
  ) {}

  static async load(store: SaveStore, delayMs = 400): Promise<SaveManager> {
    return new SaveManager(store, migrate(await store.load()), delayMs);
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
    for (const l of this.listeners) l(this.current);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Writes any pending change now. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.store.save(this.current);
  }

  subscribe(listener: SaveListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
