import { describe, expect, it } from "vitest";
import { artLevelForPiece, ART_PIECE_IDS } from "./artLevels";
import {
  DAILY_KEY,
  dailyMoment,
  dailyStatus,
  completedCount,
  emptyDailyBook,
  isDone,
  parseDailyBook,
  readDailyBook,
  recordDaily,
  saveDailyBook,
  shareOrCopy,
  shareText,
  streak,
  type DailyBook,
} from "./dailyBook";

/** M13.5: completion tracking, streaks and spoiler-free sharing. */

const book = (...dates: string[]): DailyBook =>
  dates.reduce((b, d, i) => recordDaily(b, d, 5 + i, 1000 + i).book, emptyDailyBook());

describe("recording completions", () => {
  it("counts the first completion of a day and ignores a replay of it", () => {
    const first = recordDaily(emptyDailyBook(), "2026-10-24", 7, 111);
    expect(first.isNew).toBe(true);
    expect(first.book.days["2026-10-24"]).toEqual({ date: "2026-10-24", moves: 7, at: 111 });
    const again = recordDaily(first.book, "2026-10-24", 3, 222);
    expect(again.isNew).toBe(false);
    expect(again.book).toBe(first.book); // untouched: the first result stands
    expect(completedCount(first.book)).toBe(1);
    expect(isDone(first.book, "2026-10-24")).toBe(true);
    expect(isDone(first.book, "2026-10-25")).toBe(false);
  });

  it("refuses a bad date or a nonsense move count rather than storing it", () => {
    const empty = emptyDailyBook();
    expect(recordDaily(empty, "2026-02-30", 5, 1).isNew).toBe(false);
    expect(recordDaily(empty, "2026-10-24", 0, 1).isNew).toBe(false);
    expect(recordDaily(empty, "2026-10-24", 2.5, 1).isNew).toBe(false);
  });
});

describe("the streak", () => {
  it("counts consecutive days ending today", () => {
    expect(streak(book("2026-10-22", "2026-10-23", "2026-10-24"), "2026-10-24")).toBe(3);
  });
  it("stays alive through today until the day is over: it ends yesterday", () => {
    expect(streak(book("2026-10-22", "2026-10-23"), "2026-10-24")).toBe(2);
  });
  it("is broken by a missed day, and is 0 with nothing recent or nothing at all", () => {
    expect(streak(book("2026-10-20", "2026-10-21", "2026-10-24"), "2026-10-24")).toBe(1);
    expect(streak(book("2026-10-20", "2026-10-21"), "2026-10-24")).toBe(0);
    expect(streak(emptyDailyBook(), "2026-10-24")).toBe(0);
    expect(streak(book("2026-10-24"), "not a date")).toBe(0);
  });
  it("counts across month and year ends and leap days", () => {
    expect(streak(book("2026-12-30", "2026-12-31", "2027-01-01"), "2027-01-01")).toBe(3);
    expect(streak(book("2028-02-28", "2028-02-29", "2028-03-01"), "2028-03-01")).toBe(3);
  });
  it("a future entry does not extend today's streak", () => {
    expect(streak(book("2026-10-23", "2026-10-25"), "2026-10-24")).toBe(1);
  });
});

describe("reading and storing the book", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };

  it("round-trips through storage", () => {
    const store = memory();
    const b = book("2026-10-23", "2026-10-24");
    expect(saveDailyBook(store, b)).toBe(true);
    expect(store.data.has(DAILY_KEY)).toBe(true);
    expect(readDailyBook(store)).toEqual({ book: b, ok: true });
  });

  it("drops bad entries from untrusted JSON and survives garbage", () => {
    const parsed = parseDailyBook({
      version: 1,
      days: {
        "2026-10-24": { date: "2026-10-24", moves: 4, at: 1 },
        "2026-10-25": { date: "2026-10-26", moves: 4, at: 1 }, // key and date disagree
        "2026-02-30": { date: "2026-02-30", moves: 4, at: 1 }, // not a real day
        "2026-10-27": { date: "2026-10-27", moves: -1, at: 1 },
        "2026-10-28": { date: "2026-10-28", moves: 4, at: Number.NaN },
        "2026-10-29": null,
      },
    });
    expect(Object.keys(parsed.days)).toEqual(["2026-10-24"]);
    for (const junk of [null, 5, "x", [], { days: 3 }, { days: null }])
      expect(parseDailyBook(junk)).toEqual(emptyDailyBook());
  });

  it("never throws: broken storage reads as empty with ok=false, and a failed save says so", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(readDailyBook(broken)).toEqual({ book: emptyDailyBook(), ok: false });
    expect(saveDailyBook(broken, emptyDailyBook())).toBe(false);
    expect(readDailyBook(null)).toEqual({ book: emptyDailyBook(), ok: false });
    expect(saveDailyBook(null, emptyDailyBook())).toBe(false);
    const notJson = { getItem: () => "{oops", setItem: () => undefined };
    expect(readDailyBook(notJson).ok).toBe(false);
  });
});

describe("the share text", () => {
  it("says the day, the result and the streak", () => {
    expect(shareText({ date: "2026-10-24", moves: 7, streak: 1 })).toBe(
      "Hex & Hue Daily · 2026-10-24\n✦ Solved in 7 moves",
    );
    expect(shareText({ date: "2026-10-24", moves: 1, streak: 4 })).toBe(
      "Hex & Hue Daily · 2026-10-24\n✦ Solved in 1 move\n🔥 4-day streak",
    );
  });

  it("is spoiler-free: it never contains a picture's id, name or lore, for any level of the pool", () => {
    const text = shareText({ date: "2026-10-24", moves: 9, streak: 3 });
    for (const id of ART_PIECE_IDS) {
      const level = artLevelForPiece(id)!;
      const lower = text.toLowerCase();
      expect(lower).not.toContain(id);
      expect(lower).not.toContain(level.subject!.name.toLowerCase());
      for (const word of level
        .subject!.lore.toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 5))
        expect(lower, `${id}: ${word}`).not.toContain(word);
    }
    // Only these facts, nothing else: day, move count, streak.
    expect(text.split("\n")).toHaveLength(3);
  });
});

describe("sharing", () => {
  it("uses the share sheet when there is one", async () => {
    const sent: string[] = [];
    const nav = { share: async (d: { text: string }) => void sent.push(d.text) };
    expect(await shareOrCopy("hi", nav)).toBe("shared");
    expect(sent).toEqual(["hi"]);
  });
  it("copies when sharing is missing or dismissed", async () => {
    const copied: string[] = [];
    const clipboard = { writeText: async (t: string) => void copied.push(t) };
    expect(await shareOrCopy("a", { clipboard })).toBe("copied");
    const cancelled = {
      share: async () => {
        throw new Error("AbortError");
      },
      clipboard,
    };
    expect(await shareOrCopy("b", cancelled)).toBe("copied");
    expect(copied).toEqual(["a", "b"]);
  });
  it("never rejects: no API, or a denied clipboard, is just `failed`", async () => {
    expect(await shareOrCopy("x", null)).toBe("failed");
    expect(await shareOrCopy("x", {})).toBe("failed");
    const denied = {
      clipboard: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    };
    expect(await shareOrCopy("x", denied)).toBe("failed");
  });
});

describe("what the cards say", () => {
  const done = (...d: string[]) => book(...d);

  it("the win card: complete, streak, already complete, or could not be saved (no streak claimed)", () => {
    const b = done("2026-10-23", "2026-10-24");
    const fresh = dailyMoment(b, "2026-10-24", { isNew: true, saved: true, moves: 6 });
    expect(fresh.line).toBe("Daily complete · 2-day streak");
    expect(fresh.shareText).toBe(
      "Hex & Hue Daily · 2026-10-24\n✦ Solved in 6 moves\n🔥 2-day streak",
    );
    expect(
      dailyMoment(done("2026-10-24"), "2026-10-24", { isNew: true, saved: true, moves: 6 }).line,
    ).toBe("Daily complete");
    // A replay says so and shares the first result, not this attempt's moves.
    const replay = dailyMoment(b, "2026-10-24", { isNew: false, saved: true, moves: 99 });
    expect(replay.line).toBe("Today's daily was already complete");
    expect(replay.shareText).toContain("Solved in 6 moves");
    // Unsaved: no streak in the line or the share text.
    const unsaved = dailyMoment(b, "2026-10-24", { isNew: true, saved: false, moves: 6 });
    expect(unsaved.line).toContain("could not be saved");
    expect(unsaved.shareText).not.toContain("streak");
  });

  it("the Spellbook header: waiting, done, streak and total", () => {
    expect(dailyStatus(emptyDailyBook(), "2026-10-24")).toBe("Daily: today's is waiting");
    expect(dailyStatus(done("2026-10-24"), "2026-10-24")).toBe(
      "Daily: today's is done ✓ · 1 in all",
    );
    expect(dailyStatus(done("2026-10-22", "2026-10-23", "2026-10-24"), "2026-10-24")).toBe(
      "Daily: today's is done ✓ · 3-day streak · 3 in all",
    );
    expect(dailyStatus(done("2026-10-23"), "2026-10-24")).toBe(
      "Daily: today's is waiting · 1 in all",
    );
  });
});
