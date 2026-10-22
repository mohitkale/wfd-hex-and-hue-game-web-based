/**
 * What a read found. "error" (storage unreachable) is deliberately different from "empty" (nothing
 * saved yet): a failed read must never be mistaken for a new player and overwrite real progress.
 */
export type LoadResult =
  { status: "ok"; data: unknown } | { status: "empty" } | { status: "error" };

/** Where save data lives. Implementations never throw. */
export interface SaveStore {
  readonly kind: "indexeddb" | "localstorage" | "memory";
  load(): Promise<LoadResult>;
  /** Resolves `true` once the data is durably stored. */
  save(data: unknown): Promise<boolean>;
}

const KEY = "hexhue.save";

/** Resolves to `fallback` if `promise` hasn't settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export class MemoryStore implements SaveStore {
  readonly kind = "memory";
  constructor(private value: unknown = null) {}
  async load(): Promise<LoadResult> {
    return this.value === null
      ? { status: "empty" }
      : { status: "ok", data: JSON.parse(JSON.stringify(this.value)) };
  }
  async save(data: unknown): Promise<boolean> {
    this.value = JSON.parse(JSON.stringify(data));
    return true;
  }
}

export class LocalStorageStore implements SaveStore {
  readonly kind = "localstorage";
  constructor(private readonly storage: Storage) {}
  async load(): Promise<LoadResult> {
    let raw: string | null;
    try {
      raw = this.storage.getItem(KEY);
    } catch {
      return { status: "error" };
    }
    if (raw === null) return { status: "empty" };
    try {
      return { status: "ok", data: JSON.parse(raw) };
    } catch {
      // Unrecoverable corruption: treat as empty so a fresh save can replace it.
      return { status: "empty" };
    }
  }
  async save(data: unknown): Promise<boolean> {
    try {
      this.storage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      return false; // Quota or privacy mode: keep playing; the in-memory copy is current.
    }
  }
}

/** One record in one object store. Plain IndexedDB, no library. */
export class IndexedDbStore implements SaveStore {
  readonly kind = "indexeddb";
  private db: Promise<IDBDatabase> | null = null;

  private constructor(
    private readonly factory: IDBFactory,
    private readonly timeoutMs: number,
  ) {}

  /** Opens the database, or rejects if it errors, is blocked or doesn't answer in time. */
  static async open(factory: IDBFactory, timeoutMs = 1500): Promise<IndexedDbStore> {
    const store = new IndexedDbStore(factory, timeoutMs);
    await store.connection();
    return store;
  }

  private connection(): Promise<IDBDatabase> {
    if (!this.db) {
      const opening = new Promise<IDBDatabase>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("open timed out")), this.timeoutMs);
        const req = this.factory.open("hexhue", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("save");
        req.onsuccess = () => {
          clearTimeout(timer);
          const db = req.result;
          // Let a newer build upgrade the schema; reopen lazily next time we need it.
          db.onversionchange = () => {
            db.close();
            this.db = null;
          };
          db.onclose = () => (this.db = null);
          resolve(db);
        };
        req.onerror = () => {
          clearTimeout(timer);
          reject(req.error);
        };
        req.onblocked = () => {
          clearTimeout(timer);
          reject(new Error("blocked"));
        };
      });
      opening.catch(() => (this.db = null));
      this.db = opening;
    }
    return this.db;
  }

  async load(): Promise<LoadResult> {
    try {
      const db = await this.connection();
      const value = await new Promise<unknown>((resolve, reject) => {
        const req = db.transaction("save", "readonly").objectStore("save").get(KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return value === undefined ? { status: "empty" } : { status: "ok", data: value };
    } catch {
      return { status: "error" };
    }
  }

  async save(data: unknown): Promise<boolean> {
    try {
      const db = await this.connection();
      return await new Promise<boolean>((resolve) => {
        const tx = db.transaction("save", "readwrite", { durability: "strict" });
        tx.objectStore("save").put(JSON.parse(JSON.stringify(data)), KEY);
        // Durable only once the transaction commits, not when the request succeeds.
        tx.oncomplete = () => resolve(true);
        tx.onabort = () => resolve(false);
        tx.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }
}

/**
 * The best store this browser offers: IndexedDB (most durable on mobile), then localStorage, then
 * memory (private modes that block both — the game still works, progress lasts the session). Never
 * hangs: a stalled IndexedDB open times out and falls through.
 */
export async function createStore(
  env: { indexedDB?: IDBFactory | undefined; localStorage?: Storage | undefined } = globalThis,
  timeoutMs = 1500,
): Promise<SaveStore> {
  if (env.indexedDB) {
    try {
      return await IndexedDbStore.open(env.indexedDB, timeoutMs);
    } catch {
      // Fall through.
    }
  }
  try {
    if (env.localStorage) {
      const probe = "__hexhue_probe__";
      env.localStorage.setItem(probe, "1");
      env.localStorage.removeItem(probe);
      return new LocalStorageStore(env.localStorage);
    }
  } catch {
    // Fall through.
  }
  return new MemoryStore();
}
