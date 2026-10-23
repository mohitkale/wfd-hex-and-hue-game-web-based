import { dayNumber, dayToDate } from "./daily";
import type { KeyValueStore } from "./v2Spellbook";

/**
 * Which daily challenges the player has completed (M13.5), kept in its own key, apart from the
 * Spellbook and the shipped game's save. Local only: there is no account, no leaderboard and nothing
 * leaves the device. Plain data, pure functions, and a storage wrapper that never throws, so storage
 * trouble can never block play (a completion is simply not remembered). Docs: docs/V2_DAILY.md.
 */

export interface DailyEntry {
  /** `YYYY-MM-DD` (UTC): the day the challenge was for. */
  date: string;
  /** Moves (taps that summoned or resumed a group) in the attempt that won it first. */
  moves: number;
  /** Epoch ms when it was completed. */
  at: number;
}

export interface DailyBook {
  version: 1;
  days: Record<string, DailyEntry>;
}

export const DAILY_KEY = "hexhue.v2.daily";

export const emptyDailyBook = (): DailyBook => ({ version: 1, days: {} });

/** Reads untrusted JSON: bad entries are dropped, anything unrecognisable gives an empty book. */
export function parseDailyBook(json: unknown): DailyBook {
  const book = emptyDailyBook();
  if (typeof json !== "object" || json === null) return book;
  const days = (json as { days?: unknown }).days;
  if (typeof days !== "object" || days === null) return book;
  for (const [date, raw] of Object.entries(days)) {
    const e = raw as Partial<DailyEntry> | null;
    if (!e || typeof e !== "object" || e.date !== date || dayNumber(date) === null) continue;
    if (typeof e.moves !== "number" || !Number.isInteger(e.moves) || e.moves < 1) continue;
    if (typeof e.at !== "number" || !Number.isFinite(e.at)) continue;
    book.days[date] = { date, moves: e.moves, at: e.at };
  }
  return book;
}

/**
 * Records a completion. Only the first completion of a day counts (a replay of the same day changes
 * nothing, so the streak and the first result stand). Returns a new book and whether it was new.
 */
export function recordDaily(
  book: DailyBook,
  date: string,
  moves: number,
  now: number,
): { book: DailyBook; isNew: boolean } {
  if (dayNumber(date) === null || !Number.isInteger(moves) || moves < 1)
    return { book, isNew: false };
  if (Object.hasOwn(book.days, date)) return { book, isNew: false };
  return {
    book: { version: 1, days: { ...book.days, [date]: { date, moves, at: now } } },
    isNew: true,
  };
}

export const isDone = (book: DailyBook, date: string): boolean => Object.hasOwn(book.days, date);

/** How many daily challenges have been completed in all. */
export const completedCount = (book: DailyBook): number => Object.keys(book.days).length;

/**
 * The current streak: consecutive completed days ending today, or ending yesterday if today is not
 * done yet (the streak is still alive until the day is over). 0 when neither is done.
 */
export function streak(book: DailyBook, today: string): number {
  const end = dayNumber(today);
  if (end === null) return 0;
  let day = isDone(book, today) ? end : end - 1;
  let n = 0;
  while (isDone(book, dayToDate(day))) {
    n++;
    day--;
  }
  return n;
}

/** Reads the book and says whether the read can be trusted (so a failed read is never overwritten). */
export function readDailyBook(store: KeyValueStore | null): { book: DailyBook; ok: boolean } {
  try {
    const raw = store?.getItem(DAILY_KEY);
    return { book: raw ? parseDailyBook(JSON.parse(raw)) : emptyDailyBook(), ok: store != null };
  } catch {
    return { book: emptyDailyBook(), ok: false };
  }
}

/** Returns whether the book was stored; never throws. */
export function saveDailyBook(store: KeyValueStore | null, book: DailyBook): boolean {
  try {
    store?.setItem(DAILY_KEY, JSON.stringify(book));
    return store != null;
  } catch {
    return false;
  }
}

/**
 * The text a player can share. It says that the day was solved, in how many moves and the streak:
 * never the picture, its name, a colour or any move, so it spoils nothing for a friend.
 */
export function shareText(o: { date: string; moves: number; streak: number }): string {
  const lines = [
    `Hex & Hue Daily · ${o.date}`,
    `✦ Solved in ${o.moves} ${o.moves === 1 ? "move" : "moves"}`,
  ];
  if (o.streak >= 2) lines.push(`🔥 ${o.streak}-day streak`);
  return lines.join("\n");
}

/**
 * What the win card says about a daily and what it offers to share. A completion that could not be
 * stored claims no streak (it may not be real tomorrow), and a repeat of a finished day says so; the
 * moves are always those of the first completion.
 */
export function dailyMoment(
  book: DailyBook,
  date: string,
  o: { isNew: boolean; saved: boolean; moves: number },
): { line: string; shareText: string } {
  const moves = book.days[date]?.moves ?? o.moves;
  const n = o.saved ? streak(book, date) : 0;
  const line = !o.saved
    ? `Daily ${date}: could not be saved on this device`
    : !o.isNew
      ? "Today's daily was already complete"
      : n >= 2
        ? `Daily complete · ${n}-day streak`
        : "Daily complete";
  return { line, shareText: shareText({ date, moves, streak: n }) };
}

/** One line for the Spellbook header: whether today's daily is done and the running totals. */
export function dailyStatus(book: DailyBook, today: string): string {
  const total = completedCount(book);
  const n = streak(book, today);
  const state = isDone(book, today) ? "today's is done ✓" : "today's is waiting";
  const bits = [`Daily: ${state}`];
  if (n >= 2) bits.push(`${n}-day streak`);
  if (total > 0) bits.push(`${total} in all`);
  return bits.join(" · ");
}

/** The slice of `navigator` that sharing uses (a test double or the real one). */
export interface ShareTarget {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

/**
 * Shares `text` with the system share sheet, else copies it. Resolves to what happened and never
 * rejects: a cancelled share, a missing API or a denied clipboard just report `"failed"`.
 */
export async function shareOrCopy(
  text: string,
  nav: ShareTarget | null,
): Promise<"shared" | "copied" | "failed"> {
  try {
    if (nav?.share) {
      await nav.share({ text });
      return "shared";
    }
  } catch {
    // A dismissed share sheet is not an error worth showing: fall through to copying.
  }
  try {
    if (nav?.clipboard) {
      await nav.clipboard.writeText(text);
      return "copied";
    }
  } catch {
    // Denied by the browser.
  }
  return "failed";
}
