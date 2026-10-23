import { TUTORIAL_IDS } from "./tutorialLevels";
import type { KeyValueStore } from "./v2Spellbook";

/**
 * Which tutorial levels the player has finished, and whether they skipped it (M14.2). Its own key,
 * apart from the Spellbook and the shipped save. Plain data and a storage wrapper that never throws:
 * storage trouble can only mean the tutorial is offered again, never that play is blocked.
 */

export interface TutorialBook {
  version: 1;
  /** Ids of finished tutorial levels. */
  done: string[];
  skipped: boolean;
}

export const TUTORIAL_KEY = "hexhue.v2.tutorial";

export const emptyTutorialBook = (): TutorialBook => ({ version: 1, done: [], skipped: false });

/** Reads untrusted JSON: unknown ids are dropped, anything unrecognisable gives an empty book. */
export function parseTutorialBook(json: unknown): TutorialBook {
  const book = emptyTutorialBook();
  if (typeof json !== "object" || json === null) return book;
  const o = json as { done?: unknown; skipped?: unknown };
  if (Array.isArray(o.done))
    book.done = TUTORIAL_IDS.filter((id) => (o.done as unknown[]).includes(id));
  book.skipped = o.skipped === true;
  return book;
}

export const markDone = (book: TutorialBook, id: string): TutorialBook =>
  TUTORIAL_IDS.includes(id) && !book.done.includes(id)
    ? { ...book, done: TUTORIAL_IDS.filter((x) => x === id || book.done.includes(x)) }
    : book;

export const markSkipped = (book: TutorialBook): TutorialBook => ({ ...book, skipped: true });

/** The first tutorial level not finished yet, in teaching order, or null when all are. */
export const nextTutorial = (book: TutorialBook): string | null =>
  TUTORIAL_IDS.find((id) => !book.done.includes(id)) ?? null;

/** True when a first visit should start in the tutorial: not skipped and not finished. */
export const shouldOfferTutorial = (book: TutorialBook): boolean =>
  !book.skipped && nextTutorial(book) !== null;

export function readTutorialBook(store: KeyValueStore | null): { book: TutorialBook; ok: boolean } {
  try {
    const raw = store?.getItem(TUTORIAL_KEY);
    return {
      book: raw ? parseTutorialBook(JSON.parse(raw)) : emptyTutorialBook(),
      ok: store != null,
    };
  } catch {
    return { book: emptyTutorialBook(), ok: false };
  }
}

/** Returns whether the book was stored; never throws. */
export function saveTutorialBook(store: KeyValueStore | null, book: TutorialBook): boolean {
  try {
    store?.setItem(TUTORIAL_KEY, JSON.stringify(book));
    return store != null;
  } catch {
    return false;
  }
}
