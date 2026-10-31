import { describe, expect, it } from "vitest";
import midgame from "../save/fixtures/v1-midgame.json";
import newer from "../save/fixtures/v1-newer.json";
import unversioned from "../save/fixtures/v1-unversioned.json";
import { migrate, SAVE_VERSION, defaultSave } from "../save/schema";
import { emptyDailyBook, readDailyBook, recordDaily, saveDailyBook } from "./dailyBook";
import { award, readPouch, savePouch, startingPouch } from "./pouch";
import { emptyTutorialBook, markDone, readTutorialBook, saveTutorialBook } from "./tutorialBook";
import { emptySpellbook, readSpellbook, recordWin, saveSpellbook } from "./v2Spellbook";

/**
 * M15.1: the shipped game's save (`hexhue.save`, format version 1) and the v2 board must coexist.
 * The fixtures are written to the shipped v1.0.0 schema (`packages/game/src/save/schema.ts`): a
 * mid-game save, one from before versioning, a damaged one and one from a newer build. They are
 * not exports from a live browser; the schema's own `migrate` is what real saves go through.
 */

/**
 * Damaged on purpose, as text: a JSON module import would turn the "__proto__" key into a prototype
 * assignment, which is exactly the thing this fixture checks `migrate` survives.
 */
const DAMAGED =
  '{\n  "version": 1,\n  "levels": {\n    "moonlit-01": { "stars": 9, "wins": -3 },\n    "__proto__": { "stars": 1, "wins": 1 },\n    "x": "nope"\n  },\n  "skipped": ["a", "a", 7, null],\n  "coins": -50,\n  "boosters": { "undo": "many", "shuffle": 2.9, "extraSlot": -1, "wand": null },\n  "settings": { "sfxVolume": 7, "reducedMotion": "sometimes" },\n  "stats": [1, 2],\n  "lastPlayed": { "world": "x", "level": 1 }\n}';

const RAW: Record<string, unknown> = {
  "v1-midgame": midgame,
  "v1-unversioned": unversioned,
  "v1-damaged": JSON.parse(DAMAGED),
  "v1-newer": newer,
};
/** The fixture's JSON text, as it would sit in storage. */
const fixture = (name: string): string => JSON.stringify(RAW[name]);
const FIXTURES = ["v1-midgame", "v1-unversioned", "v1-damaged", "v1-newer"] as const;

describe("real-shaped v1 saves still load", () => {
  it("a mid-game save round-trips unchanged", () => {
    const raw = JSON.parse(fixture("v1-midgame")) as unknown;
    expect(migrate(raw)).toEqual(raw);
  });

  it("a save from before versioning keeps its progress and gains the version", () => {
    const s = migrate(JSON.parse(fixture("v1-unversioned")));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.levels["moonlit-01"]).toEqual({ stars: 2, wins: 1 });
    expect(s.coins).toBe(40);
    expect(s.settings.sound).toBe(false);
    expect(s.settings.music).toBe(true);
  });

  it("a damaged save is repaired field by field and never gives a free top-up", () => {
    const s = migrate(JSON.parse(fixture("v1-damaged")));
    expect(s.levels["moonlit-01"]).toEqual({ stars: 3, wins: 1 });
    expect(Object.keys(s.levels)).toEqual(["moonlit-01", "__proto__"]);
    expect(Object.getPrototypeOf(s.levels)).toBe(Object.prototype);
    expect(s.skipped).toEqual(["a"]);
    expect(s.coins).toBe(0);
    expect(s.boosters).toEqual({ undo: 2, shuffle: 2, extraSlot: 0, wand: 2 });
    expect(s.settings.sfxVolume).toBe(1);
    expect(s.settings.reducedMotion).toBe("system");
    expect(s.lastPlayed).toBeNull();
  });

  it("a save from a newer build is read, not wiped", () => {
    const s = migrate(JSON.parse(fixture("v1-newer")));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.levels["moonlit-01"]).toEqual({ stars: 3, wins: 1 });
    expect(s.coins).toBe(10);
  });

  it.each(FIXTURES)("%s migrates to a valid save", (name) => {
    const s = migrate(JSON.parse(fixture(name)));
    expect(Object.keys(s).sort()).toEqual(Object.keys(defaultSave()).sort());
    expect(s.coins).toBeGreaterThanOrEqual(0);
    for (const p of Object.values(s.levels)) {
      expect(p.stars).toBeGreaterThanOrEqual(1);
      expect(p.stars).toBeLessThanOrEqual(3);
      expect(p.wins).toBeGreaterThanOrEqual(1);
    }
    for (const n of Object.values(s.boosters)) expect(Number.isInteger(n) && n >= 0).toBe(true);
  });
});

function memoryStore(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("the v2 board beside a v1 save", () => {
  it.each(FIXTURES)("with %s present, every v2 store starts fresh and readable", (name) => {
    const store = memoryStore({ "hexhue.save": fixture(name) });
    expect(readPouch(store)).toEqual({ pouch: startingPouch(), ok: true });
    expect(readSpellbook(store)).toEqual({ book: emptySpellbook(), ok: true });
    expect(readDailyBook(store)).toEqual({ book: emptyDailyBook(), ok: true });
    expect(readTutorialBook(store)).toEqual({ book: emptyTutorialBook(), ok: true });
  });

  it.each(FIXTURES)("a whole v2 session (%s present) never touches the v1 save", (name) => {
    const raw = fixture(name);
    const store = memoryStore({ "hexhue.save": raw });
    savePouch(store, award(startingPouch(), "art-moon", { cubes: 400 }).pouch);
    saveSpellbook(store, recordWin(emptySpellbook(), "moon", 1).book);
    saveDailyBook(store, recordDaily(emptyDailyBook(), "2026-10-24", 9, 1).book);
    saveTutorialBook(store, markDone(emptyTutorialBook(), "tutorial-summon"));
    // The v1 text is byte-for-byte what it was, and every v2 key is in its own namespace.
    expect(store.data.get("hexhue.save")).toBe(raw);
    const written = [...store.data.keys()].filter((k) => k !== "hexhue.save");
    expect(written.length).toBeGreaterThanOrEqual(4);
    for (const k of written) expect(k.startsWith("hexhue.v2.")).toBe(true);
  });

  it("v1 coins and booster counts are not the v2 pouch: neither moves the other", () => {
    const v1 = migrate(JSON.parse(fixture("v1-midgame")));
    const pouch = award(startingPouch(), "art-moon", { cubes: 400 }).pouch;
    expect(pouch.coins).toBe(startingPouch().coins + 25);
    expect(v1.coins).toBe(137);
    // The v2 boosters only: v1's Shuffle and Wand have no v2 equivalent and never appear.
    expect(Object.keys(pouch.boosters).sort()).toEqual([
      "call",
      "extraSlot",
      "hint",
      "lantern",
      "sweep",
      "undo",
    ]);
    expect(pouch.boosters).not.toHaveProperty("shuffle");
    expect(pouch.boosters).not.toHaveProperty("wand");
  });

  it("v2 data in storage never confuses the v1 loader", () => {
    const v2 = {
      "hexhue.v2.pouch": JSON.stringify(startingPouch()),
      "hexhue.v2.daily": JSON.stringify(emptyDailyBook()),
    };
    // A v1 loader only ever reads `hexhue.save`; with it absent, a new player is simply fresh.
    expect(migrate(JSON.parse(memoryStore(v2).getItem("hexhue.save") ?? "null"))).toEqual(
      defaultSave(),
    );
  });
});
