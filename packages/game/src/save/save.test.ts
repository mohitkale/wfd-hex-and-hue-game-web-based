import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveManager } from "./manager";
import { mergeSaves } from "./merge";
import { SAVE_VERSION, defaultSave, migrate } from "./schema";
import { starsFor } from "./stars";
import {
  IndexedDbStore,
  LocalStorageStore,
  MemoryStore,
  createStore,
  type LoadResult,
  type SaveStore,
} from "./store";

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

  it("repairs bad fields one by one; negatives clamp to 0 (never a free top-up)", () => {
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
    expect(m.settings).toEqual({
      haptics: false,
      sound: true,
      music: true,
      sfxVolume: 0.8,
      musicVolume: 0.5,
    });
    expect(m.stats).toEqual({ plays: 0, wins: 3, losses: 0 });
    expect(m.lastPlayed).toBeNull();
  });

  it("clamps volumes to 0..1 and defaults missing ones", () => {
    const m = migrate({ version: SAVE_VERSION, settings: { sfxVolume: 3, musicVolume: "loud" } });
    expect(m.settings.sfxVolume).toBe(1);
    expect(m.settings.musicVolume).toBe(0.5);
  });

  it("treats odd versions as unversioned instead of wiping the save", () => {
    for (const version of [-1, 0.5, undefined])
      expect(migrate({ version, coins: 7 }).coins).toBe(7);
    expect(migrate({ version: SAVE_VERSION + 5, coins: 9 }).coins).toBe(9);
  });

  it("reads skipped levels: missing → empty, junk filtered, duplicates removed", () => {
    expect(migrate({ version: SAVE_VERSION }).skipped).toEqual([]);
    expect(migrate({ version: SAVE_VERSION, skipped: ["a", 3, "b", "a", null] }).skipped).toEqual([
      "a",
      "b",
    ]);
  });

  it("saves from before tips: players who already won a level skip the tutorial tips", () => {
    const veteran = migrate({ version: 1, levels: { "moonlit-01": { stars: 3, wins: 1 } } });
    expect(veteran.tips).toEqual(["launch", "collect", "portal", "park", "relaunch"]);
    expect(migrate({ version: 1, coins: 5 }).tips).toEqual([]);
    expect(migrate({ version: SAVE_VERSION, tips: ["a", 1, "a"] }).tips).toEqual(["a"]);
    // An explicit list wins, even an empty one.
    expect(migrate({ version: 1, levels: { x: { stars: 1, wins: 1 } }, tips: [] }).tips).toEqual(
      [],
    );
  });

  it("keeps a level id of __proto__ as a plain key", () => {
    const m = migrate(JSON.parse('{"levels":{"__proto__":{"stars":2,"wins":1}}}'));
    expect(Object.getPrototypeOf(m.levels)).toBe(Object.prototype);
    expect(Object.keys(m.levels)).toEqual(["__proto__"]);
  });
});

describe("mergeSaves", () => {
  it("applies this tab's counter changes on top of another tab's", () => {
    const base = defaultSave(); // 100 coins
    const mine = { ...defaultSave(), coins: 70 }; // spent 30
    const theirs = { ...defaultSave(), coins: 160 }; // other tab earned 60
    expect(mergeSaves(base, mine, theirs).coins).toBe(130);
  });

  it("unions level progress keeping the best stars and most wins", () => {
    const base = defaultSave();
    const mine = defaultSave();
    mine.levels = { a: { stars: 2, wins: 1 }, b: { stars: 3, wins: 1 } };
    const theirs = defaultSave();
    theirs.levels = { a: { stars: 3, wins: 4 }, c: { stars: 1, wins: 1 } };
    expect(mergeSaves(base, mine, theirs).levels).toEqual({
      a: { stars: 3, wins: 4 },
      b: { stars: 3, wins: 1 },
      c: { stars: 1, wins: 1 },
    });
  });

  it("unions skipped levels without duplicates", () => {
    const base = defaultSave();
    const mine = { ...defaultSave(), skipped: ["a", "b"] };
    const theirs = { ...defaultSave(), skipped: ["b", "c"] };
    expect(mergeSaves(base, mine, theirs).skipped.sort()).toEqual(["a", "b", "c"]);
    const tipsMerged = mergeSaves(
      defaultSave(),
      { ...defaultSave(), tips: ["launch"] },
      { ...defaultSave(), tips: ["collect"] },
    ).tips;
    expect(tipsMerged.sort()).toEqual(["collect", "launch"]);
    // Another tab wrote a save from before tips existed (a veteran): its tutorial marks merge in.
    const raw = { version: 1, levels: { "moonlit-01": { stars: 2, wins: 1 } } };
    const withVeteran = mergeSaves(
      defaultSave(),
      { ...defaultSave(), tips: ["hint"] },
      migrate(raw),
    ).tips;
    expect(withVeteran).toContain("hint");
    expect(withVeteran).toContain("relaunch");
  });

  it("keeps their settings unless this tab changed them", () => {
    const base = defaultSave();
    const theirs = {
      ...defaultSave(),
      settings: { ...defaultSave().settings, haptics: false, music: false },
    };
    expect(mergeSaves(base, defaultSave(), theirs).settings).toEqual(theirs.settings);
    const mine = { ...defaultSave(), settings: { ...defaultSave().settings, sound: false } };
    expect(mergeSaves(base, mine, theirs).settings).toEqual(mine.settings);
  });
});

describe("stores", () => {
  it("memory store distinguishes empty from ok and isolates copies", async () => {
    const store = new MemoryStore();
    expect(await store.load()).toEqual({ status: "empty" });
    const data = { a: 1 };
    await store.save(data);
    data.a = 2;
    expect(await store.load()).toEqual({ status: "ok", data: { a: 1 } });
  });

  it("localStorage: unreadable is an error, corrupt JSON is empty, quota fails softly", async () => {
    const backing = new Map<string, string>();
    let readable = true;
    const storage = {
      getItem: (k: string) => {
        if (!readable) throw new Error("SecurityError");
        return backing.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (v.length > 50) throw new Error("QuotaExceeded");
        backing.set(k, v);
      },
      removeItem: (k: string) => backing.delete(k),
    } as unknown as Storage;
    const store = new LocalStorageStore(storage);
    backing.set("hexhue.save", "{not json");
    expect(await store.load()).toEqual({ status: "empty" });
    readable = false;
    expect(await store.load()).toEqual({ status: "error" });
    expect(await store.save({ big: "x".repeat(100) })).toBe(false);
  });

  it("IndexedDB round-trips and reports empty first", async () => {
    const store = await IndexedDbStore.open(new IDBFactory());
    expect(await store.load()).toEqual({ status: "empty" });
    expect(await store.save({ coins: 5 })).toBe(true);
    expect(await store.load()).toEqual({ status: "ok", data: { coins: 5 } });
  });

  it("never hangs: a stalled IndexedDB open falls back to localStorage or memory", async () => {
    const stalled = { open: () => ({}) } as unknown as IDBFactory;
    const store = await createStore({ indexedDB: stalled }, 30);
    expect(store.kind).toBe("memory");
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

/** A store whose reads can be made to fail or hang. */
class FlakyStore extends MemoryStore {
  mode: "ok" | "error" | "hang" = "ok";
  override async load(): Promise<LoadResult> {
    if (this.mode === "error") return { status: "error" };
    if (this.mode === "hang") return new Promise(() => {});
    return super.load();
  }
}

describe("SaveManager", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("updates in memory immediately and writes once after a burst", async () => {
    const store = new MemoryStore({ version: SAVE_VERSION, coins: 30 });
    const spy = vi.spyOn(store, "save");
    const save = await SaveManager.load(store, { delayMs: 400 });
    save.update((d) => (d.coins += 10));
    save.update((d) => (d.coins += 10));
    expect(save.data.coins).toBe(50);
    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(spy).toHaveBeenCalledTimes(1);
    const stored = (await store.load()) as { status: "ok"; data: { coins: number } };
    expect(stored.data.coins).toBe(50);
  });

  it("does not write when nothing changed (no stale overwrite on tab switch)", async () => {
    const store = new MemoryStore();
    const spy = vi.spyOn(store, "save");
    const save = await SaveManager.load(store);
    await save.flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it("merges with another tab's progress instead of overwriting it", async () => {
    const store = new MemoryStore();
    const tabA = await SaveManager.load(store);
    const tabB = await SaveManager.load(store);
    tabB.update((d) => {
      d.levels["moonlit-01"] = { stars: 3, wins: 1 };
      d.coins += 40;
    });
    await tabB.flush();
    tabA.update((d) => (d.coins -= 20));
    await tabA.flush();
    const stored = migrate(((await store.load()) as { data: unknown }).data);
    expect(stored.levels["moonlit-01"]).toEqual({ stars: 3, wins: 1 });
    expect(stored.coins).toBe(120);
  });

  it("a failed first read never wipes the real save; changes merge in once storage is back", async () => {
    const real = { ...defaultSave(), coins: 500, levels: { "moonlit-05": { stars: 2, wins: 3 } } };
    const store = new FlakyStore(real);
    store.mode = "error";
    const save = await SaveManager.load(store);
    expect(save.data.coins).toBe(100); // playing on defaults meanwhile
    save.update((d) => (d.coins += 10));
    await save.flush(); // storage still unreadable: nothing written
    const untouched = (await MemoryStore.prototype.load.call(store)) as { data: { coins: number } };
    expect(untouched.data.coins).toBe(500);
    store.mode = "ok";
    await save.flush();
    const stored = migrate(((await store.load()) as { data: unknown }).data);
    expect(stored.coins).toBe(510);
    expect(stored.levels["moonlit-05"]).toEqual({ stars: 2, wins: 3 });
  });

  it("a hanging read times out instead of blocking the game", async () => {
    const store = new FlakyStore();
    store.mode = "hang";
    const pending = SaveManager.load(store, { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    expect((await pending).data.coins).toBe(100);
  });

  it("never writes over a save from a newer version of the game", async () => {
    const store: SaveStore = new MemoryStore({ version: SAVE_VERSION + 1, coins: 999 });
    const spy = vi.spyOn(store, "save");
    const save = await SaveManager.load(store);
    save.update((d) => (d.coins = 1));
    await save.flush();
    expect(spy).not.toHaveBeenCalled();
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

describe("starsFor", () => {
  it("rates by assists", () => {
    expect([0, 1, 2, 3, 9].map(starsFor)).toEqual([3, 2, 2, 1, 1]);
  });
});
