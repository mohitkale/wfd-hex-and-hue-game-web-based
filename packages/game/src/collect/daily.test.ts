import { describe, expect, it } from "vitest";
import { ART_PIECE_IDS } from "./artLevels";
import { JOURNEY } from "./journey";
import { DAILY_VERSION, dailyIndex, dailyLevelId, dayNumber, dayToDate, utcDate } from "./daily";

/** M13.5: the same date gives the same level on every device, and the schedule is fair. */

/** Any pool, for the schedule's own rules. */
const POOL = ART_PIECE_IDS.map((id) => `art-${id}`);
/** The game's pool: the witch's journey (M15.13). */
const JOURNEY_POOL = JOURNEY.map((e) => e.id);

describe("dates", () => {
  it("turns real calendar dates into day numbers and back, and rejects everything else", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dayNumber("2026-10-24")).toBe(20750);
    expect(dayToDate(20750)).toBe("2026-10-24");
    expect(dayToDate(dayNumber("2028-02-29")!)).toBe("2028-02-29"); // a leap day
    for (const bad of [
      "2026-02-30",
      "2027-02-29",
      "2026-13-01",
      "2026-00-10",
      "26-10-24",
      "2026-1-5",
      "",
      "today",
      "2026-10-24T10:00",
    ])
      expect(dayNumber(bad), bad).toBeNull();
  });

  it("reads the UTC date of a clock reading, not the local one", () => {
    expect(utcDate(Date.UTC(2026, 9, 24, 23, 59, 59))).toBe("2026-10-24");
    expect(utcDate(Date.UTC(2026, 9, 25, 0, 0, 0))).toBe("2026-10-25");
    expect(utcDate(Number.NaN)).toBe("");
    expect(utcDate(1e20)).toBe("");
  });
});

describe("the schedule is deterministic and pinned", () => {
  it("the pool is pinned: change it and you must bump DAILY_VERSION and update this list", () => {
    expect([...JOURNEY_POOL].sort()).toEqual([
      "j-amethyst",
      "j-as-above",
      "j-blessed-cat",
      "j-brew-cauldron",
      "j-broom",
      "j-candle",
      "j-crescent",
      "j-crystal-ball",
      "j-crystal-grid",
      "j-grimoire",
      "j-lavender",
      "j-mandrake",
      "j-mortar",
      "j-owl-moon",
      "j-pentacle",
      "j-quartz",
      "j-raven",
      "j-samhain",
      "j-spider-web",
      "j-tarot-star",
      "j-toad",
      "j-triple-moon",
      "j-wheel-of-year",
      "j-witchs-hat",
    ]);
    expect(DAILY_VERSION).toBe(2);
  });

  it("gives these exact levels on these dates (version 2): identical on every device", () => {
    const expected: [string, string][] = [
      ["2026-10-24", "j-as-above"],
      ["2026-10-25", "j-witchs-hat"],
      ["2026-10-26", "j-owl-moon"],
      ["2026-10-27", "j-grimoire"],
      ["2026-10-28", "j-mandrake"],
      ["2026-10-29", "j-crystal-grid"],
      ["2026-10-30", "j-toad"],
      ["2026-10-31", "j-crescent"],
      ["2027-01-01", "j-samhain"],
      ["2028-02-29", "j-mandrake"],
    ];
    for (const [date, id] of expected) expect(dailyLevelId(date, JOURNEY_POOL), date).toBe(id);
  });

  it("does not depend on the order the pool is listed in", () => {
    const shuffled = [...POOL].reverse();
    for (let day = 20750; day < 20800; day++) {
      const date = dayToDate(day);
      expect(dailyLevelId(date, shuffled), date).toBe(dailyLevelId(date, POOL));
    }
  });

  it("changes with the version, and gives null for a bad date or an empty pool", () => {
    let differs = 0;
    for (let day = 20750; day < 20800; day++)
      if (dailyIndex(day, 6, 1) !== dailyIndex(day, 6, 2)) differs++;
    expect(differs).toBeGreaterThan(10);
    expect(dailyLevelId("2026-02-30", POOL)).toBeNull();
    expect(dailyLevelId("2026-10-24", [])).toBeNull();
    expect(() => dailyIndex(1.5, 6)).toThrow();
    expect(() => dailyIndex(1, 0)).toThrow();
  });
});

describe("the schedule is fair", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 9, 12])(
    "pool of %i: valid indices, every level once per cycle",
    (size) => {
      for (let cycle = 3000; cycle < 3040; cycle++) {
        const seen = new Set<number>();
        for (let k = 0; k < size; k++) {
          const i = dailyIndex(cycle * size + k, size);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(size);
          seen.add(i);
        }
        expect(seen.size, `cycle ${cycle}`).toBe(size);
      }
    },
  );

  it.each([2, 3, 4, 5, 6, 7, 9, 12])(
    "pool of %i: never the same level two days running (also across cycles)",
    (size) => {
      let prev = dailyIndex(0, size);
      for (let day = 1; day < 6000; day++) {
        const now = dailyIndex(day, size);
        expect(now, `day ${day}`).not.toBe(prev);
        prev = now;
      }
    },
  );

  it.each([3, 6, 7])(
    "works across 1970 and before it (pool of %i): once per cycle, never twice running",
    (size) => {
      let prev = dailyIndex(-3000, size);
      for (let cycle = -300; cycle < 300; cycle++) {
        const seen = new Set<number>();
        for (let k = 0; k < size; k++) seen.add(dailyIndex(cycle * size + k, size));
        expect(seen.size, `cycle ${cycle}`).toBe(size);
      }
      for (let day = -2999; day < 3000; day++) {
        const now = dailyIndex(day, size);
        expect(now, `day ${day}`).not.toBe(prev);
        prev = now;
      }
    },
  );

  it("every level of the pool comes up within a cycle of the real pool", () => {
    const seen = new Set<string>();
    for (let k = 0; k < POOL.length; k++) {
      seen.add(dailyLevelId(dayToDate(20748 + k), POOL)!);
    }
    expect(seen.size).toBe(POOL.length);
  });
});

describe("?level=daily", () => {
  const now = Date.UTC(2026, 9, 24, 12, 0, 0);

  it("picks today's level by the UTC date, and ?date= another day (a bad date falls back to today)", async () => {
    const { dailyFromSearch } = await import("./levels");
    const today = dailyFromSearch("?engine=v2&level=daily", now);
    expect(today).toEqual({ date: "2026-10-24", levelId: "j-as-above" });
    expect(dailyFromSearch("?level=daily&date=2026-10-26", now)).toEqual({
      date: "2026-10-26",
      levelId: "j-owl-moon",
    });
    expect(dailyFromSearch("?level=daily&date=2026-02-30", now)?.date).toBe("2026-10-24");
  });

  it('is not the daily for any other level, and a replay choice of "daily" wins over the address bar', async () => {
    const { dailyFromSearch } = await import("./levels");
    expect(dailyFromSearch("?level=art-black-cat", now)).toBeNull();
    expect(dailyFromSearch("", now)).toBeNull();
    expect(dailyFromSearch("?level=art-black-cat", now, "daily")?.date).toBe("2026-10-24");
    // The Spellbook's Daily button is always today, even with a review ?date= left in the address.
    expect(dailyFromSearch("?level=daily&date=2026-10-26", now, "daily")?.date).toBe("2026-10-24");
    expect(dailyFromSearch("?level=daily", now, "art-libra-scales")).toBeNull();
  });

  it("the same instant gives the same daily on every device, whatever the pool object order", async () => {
    const { dailyFromSearch } = await import("./levels");
    const a = dailyFromSearch("?level=daily", now);
    const b = dailyFromSearch("?level=daily", now);
    expect(b).toEqual(a);
  });
});
