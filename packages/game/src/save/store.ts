/** Where save data lives. Implementations never throw: failures resolve to "nothing stored". */
export interface SaveStore {
  readonly kind: "indexeddb" | "localstorage" | "memory";
  load(): Promise<unknown>;
  save(data: unknown): Promise<void>;
}

const KEY = "hexhue.save";

export class MemoryStore implements SaveStore {
  readonly kind = "memory";
  constructor(private value: unknown = null) {}
  async load(): Promise<unknown> {
    return this.value === null ? null : JSON.parse(JSON.stringify(this.value));
  }
  async save(data: unknown): Promise<void> {
    this.value = JSON.parse(JSON.stringify(data));
  }
}

export class LocalStorageStore implements SaveStore {
  readonly kind = "localstorage";
  constructor(private readonly storage: Storage) {}
  async load(): Promise<unknown> {
    try {
      const raw = this.storage.getItem(KEY);
      return raw === null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }
  async save(data: unknown): Promise<void> {
    try {
      this.storage.setItem(KEY, JSON.stringify(data));
    } catch {
      // Quota or privacy mode: keep playing; the in-memory copy is still current.
    }
  }
}

/** One record in one object store. Plain IndexedDB, no library. */
export class IndexedDbStore implements SaveStore {
  readonly kind = "indexeddb";
  private db: Promise<IDBDatabase>;

  constructor(factory: IDBFactory) {
    this.db = new Promise((resolve, reject) => {
      const req = factory.open("hexhue", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("save");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("blocked"));
    });
  }

  private async run<T>(
    mode: IDBTransactionMode,
    op: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const req = op(db.transaction("save", mode).objectStore("save"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async load(): Promise<unknown> {
    try {
      return (await this.run("readonly", (s) => s.get(KEY))) ?? null;
    } catch {
      return null;
    }
  }

  async save(data: unknown): Promise<void> {
    try {
      await this.run("readwrite", (s) => s.put(JSON.parse(JSON.stringify(data)), KEY));
    } catch {
      // Ignore: see LocalStorageStore.save.
    }
  }
}

/**
 * The best store this browser offers: IndexedDB (most durable on mobile), then localStorage, then
 * memory (private modes that block both — the game still works, progress lasts the session).
 */
export async function createStore(
  env: {
    indexedDB?: IDBFactory | undefined;
    localStorage?: Storage | undefined;
  } = globalThis,
): Promise<SaveStore> {
  if (env.indexedDB) {
    const store = new IndexedDbStore(env.indexedDB);
    try {
      await store["db"];
      return store;
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
