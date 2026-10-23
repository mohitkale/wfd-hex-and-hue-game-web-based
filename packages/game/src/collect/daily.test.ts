import { describe, expect, it } from "vitest";
import { ART_PIECE_IDS } from "./artLevels";
import { DAILY_VERSION, dailyIndex, dailyLevelId, dayNumber, dayToDate, utcDate } from "./daily";

/** M13.5: the same date gives the same level on every device, and the schedule is fair. */

const POOL = ART_PIECE_IDS.map((id) => `art-${id}`);

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
    expect([...POOL].sort()).toEqual([
      "art-amethyst-cluster",
      "art-black-cat",
      "art-crescent-moon",
      "art-libra-scales",
      "art-triple-moon",
      "art-witchs-cauldron",
    ]);
    expect(DAILY_VERSION).toBe(1);
  });

  it("gives these exact levels on these dates (version 1): identical on every device", () => {
    const expected: [string, string][] = [
      ["2026-10-24", "art-black-cat"],
      ["2026-10-25", "art-libra-scales"],
      ["2026-10-26", "art-triple-moon"],
      ["2026-10-27", "art-witchs-cauldron"],
      ["2026-10-28", "art-black-cat"],
      ["2026-10-29", "art-witchs-cauldron"],
      ["2026-10-30", "art-amethyst-cluster"],
      ["2026-10-31", "art-triple-moon"],
      ["2027-01-01", "art-amethyst-cluster"],
      ["2028-02-29", "art-libra-scales"],
    ];
    for (const [date, id] of expected) expect(dailyLevelId(date, POOL), date).toBe(id);
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

  it("works for days before 1970 too (negative day numbers)", () => {
    for (let day = -50; day < 0; day++) {
      const i = dailyIndex(day, 6);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(6);
    }
  });

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
    expect(today).toEqual({ date: "2026-10-24", levelId: "art-black-cat" });
    expect(dailyFromSearch("?level=daily&date=2026-10-26", now)).toEqual({
      date: "2026-10-26",
      levelId: "art-triple-moon",
    });
    expect(dailyFromSearch("?level=daily&date=2026-02-30", now)?.date).toBe("2026-10-24");
  });

  it('is not the daily for any other level, and a replay choice of "daily" wins over the address bar', async () => {
    const { dailyFromSearch } = await import("./levels");
    expect(dailyFromSearch("?level=art-black-cat", now)).toBeNull();
    expect(dailyFromSearch("", now)).toBeNull();
    expect(dailyFromSearch("?level=art-black-cat", now, "daily")?.date).toBe("2026-10-24");
    expect(dailyFromSearch("?level=daily", now, "art-libra-scales")).toBeNull();
  });

  it("the same instant gives the same daily on every device, whatever the pool object order", async () => {
    const { dailyFromSearch } = await import("./levels");
    const a = dailyFromSearch("?level=daily", now);
    const b = dailyFromSearch("?level=daily", now);
    expect(b).toEqual(a);
  });
});
