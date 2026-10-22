import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveManager } from "./manager";
import { SAVE_VERSION, defaultSave, migrate } from "./schema";
import { LocalStorageStore, MemoryStore, createStore } from "./store";

describe("migrate", () => {
  it("gives a fresh save for nothing or garbage", () => {
    for (const raw of [null, undefined, 42, "x", [], { version: "nope" }]) {
      expect(migrate(raw)).toEqual(defaultSave());
    }
  });

  it("round-trips a valid save unchanged", () => {
    const s = defaultSave();
    s.levels["moonlit-01"] = { stars: 3, wins: 2 };
    s.coins = 250;
    s.lastPlayed = { world: 1, level: 4 };
    expect(migrate(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("repairs bad fields one by one without losing the good ones", () => {
    const m = migrate({
      version: SAVE_VERSION,
      coins: -50,
      levels: {
        "moonlit-01": { stars: 9, wins: 0 },
        "moonlit-02": "broken",
        "crystal-03": { stars: 2 },
      },
      boosters: { undo: 5, shuffle: "lots", wand: -1 },
      settings: { haptics: false, sound: "yes" },
      stats: { wins: 3.7 },
      lastPlayed: { world: "x", level: 2 },
    });
    expect(m.coins).toBe(0);
    expect(m.levels).toEqual({
      "moonlit-01": { stars: 3, wins: 1 },
      "crystal-03": { stars: 2, wins: 1 },
    });
    expect(m.boosters).toEqual({ undo: 5, shuffle: 2, extraSlot: 2, wand: 0 });
    expect(m.settings).toEqual({ haptics: false, sound: true, music: true });
    expect(m.stats).toEqual({ plays: 0, wins: 3, losses: 0 });
    expect(m.lastPlayed).toBeNull();
  });

  it("upgrades an unversioned save and reads a newer one as best it can", () => {
    expect(migrate({ coins: 7 }).coins).toBe(7);
    expect(migrate({ version: SAVE_VERSION + 5, coins: 9 }).coins).toBe(9);
  });
});

describe("stores", () => {
  it("memory store isolates copies", async () => {
    const store = new MemoryStore();
    const data = { a: 1 };
    await store.save(data);
    data.a = 2;
    expect(await store.load()).toEqual({ a: 1 });
  });

  it("localStorage store survives corrupt JSON and quota errors", async () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (v.length > 50) throw new Error("QuotaExceeded");
        backing.set(k, v);
      },
      removeItem: (k: string) => backing.delete(k),
    } as unknown as Storage;
    const store = new LocalStorageStore(storage);
    backing.set("hexhue.save", "{not json");
    expect(await store.load()).toBeNull();
    await expect(store.save({ big: "x".repeat(100) })).resolves.toBeUndefined();
  });

  it("falls back to memory when no storage is available", async () => {
    expect((await createStore({})).kind).toBe("memory");
    const throwing = {
      setItem: () => {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;
    expect((await createStore({ localStorage: throwing })).kind).toBe("memory");
  });
});

describe("SaveManager", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("loads, updates in memory immediately and writes once after a burst", async () => {
    const store = new MemoryStore({ version: SAVE_VERSION, coins: 30 });
    const spy = vi.spyOn(store, "save");
    const save = await SaveManager.load(store, 400);
    expect(save.data.coins).toBe(30);
    save.update((d) => (d.coins += 10));
    save.update((d) => (d.coins += 10));
    expect(save.data.coins).toBe(50);
    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(((await store.load()) as { coins: number }).coins).toBe(50);
  });

  it("flush writes immediately and cancels the pending write", async () => {
    const store = new MemoryStore();
    const spy = vi.spyOn(store, "save");
    const save = await SaveManager.load(store);
    save.update((d) => (d.coins = 5));
    await save.flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("keeps invariants after an update and notifies listeners", async () => {
    const save = await SaveManager.load(new MemoryStore());
    const seen: number[] = [];
    save.subscribe((d) => seen.push(d.coins));
    save.update((d) => (d.coins = -10));
    expect(save.data.coins).toBe(0);
    expect(seen).toEqual([0]);
  });
});
