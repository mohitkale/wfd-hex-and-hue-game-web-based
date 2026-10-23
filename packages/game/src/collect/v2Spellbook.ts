/**
 * The v2 Spellbook (M11.5): which pictures the player has completed on the v2 board. Kept apart
 * from the shipped game's save (`hexhue.save`), which the v2 review build must not touch. Plain data
 * and pure functions plus a tiny storage wrapper that never throws: storage trouble must never
 * block play (a win simply is not remembered).
 */

export interface SpellbookEntry {
  /** The art piece id. */
  id: string;
  /** Epoch ms of the first win. */
  unlockedAt: number;
  /** How many times it has been completed. */
  wins: number;
}

export interface V2Spellbook {
  version: 1;
  entries: Record<string, SpellbookEntry>;
}

export const SPELLBOOK_KEY = "hexhue.v2.spellbook";

export const emptySpellbook = (): V2Spellbook => ({ version: 1, entries: {} });

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;

/** Reads untrusted JSON: bad entries are dropped, anything unrecognisable gives an empty book. */
export function parseSpellbook(json: unknown): V2Spellbook {
  const book = emptySpellbook();
  if (typeof json !== "object" || json === null) return book;
  const entries = (json as { entries?: unknown }).entries;
  if (typeof entries !== "object" || entries === null) return book;
  for (const [id, raw] of Object.entries(entries)) {
    const e = raw as Partial<SpellbookEntry> | null;
    if (!e || typeof e !== "object") continue;
    if (id === "" || e.id !== id) continue;
    if (typeof e.unlockedAt !== "number" || !Number.isFinite(e.unlockedAt)) continue;
    if (!isCount(e.wins)) continue;
    book.entries[id] = { id, unlockedAt: e.unlockedAt, wins: e.wins };
  }
  return book;
}

/** Records a win: the first one unlocks the picture, later ones count. Returns a new book. */
export function recordWin(
  book: V2Spellbook,
  id: string,
  now: number,
): { book: V2Spellbook; isNew: boolean } {
  const prev = book.entries[id];
  const entry: SpellbookEntry = prev
    ? { ...prev, wins: prev.wins + 1 }
    : { id, unlockedAt: now, wins: 1 };
  return {
    book: { version: 1, entries: { ...book.entries, [id]: entry } },
    isNew: !prev,
  };
}

export const isUnlocked = (book: V2Spellbook, id: string): boolean =>
  Object.hasOwn(book.entries, id);

/** Unlocked entries, oldest first. */
export const unlockedList = (book: V2Spellbook): SpellbookEntry[] =>
  Object.values(book.entries).sort(
    (a, b) => a.unlockedAt - b.unlockedAt || a.id.localeCompare(b.id),
  );

/** The slice of `Storage` the book needs (a test double or `localStorage`). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSpellbook(store: KeyValueStore | null): V2Spellbook {
  try {
    const raw = store?.getItem(SPELLBOOK_KEY);
    return raw ? parseSpellbook(JSON.parse(raw)) : emptySpellbook();
  } catch {
    return emptySpellbook();
  }
}

/** Returns whether the book was stored; never throws. */
export function saveSpellbook(store: KeyValueStore | null, book: V2Spellbook): boolean {
  try {
    store?.setItem(SPELLBOOK_KEY, JSON.stringify(book));
    return store != null;
  } catch {
    return false;
  }
}

/** `window.localStorage` when it can be used at all (private modes may throw), else null. */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
