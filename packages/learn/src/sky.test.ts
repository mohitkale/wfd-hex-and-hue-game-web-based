import { describe, expect, it } from "vitest";
import {
  moonAt,
  nextPhases,
  nextSabbat,
  nextSolarPoint,
  phaseOf,
  signOf,
  wheelOfTheYear,
} from "./sky";

const MIN = 60_000;
const utc = (s: string) => Date.parse(`${s}Z`);
/** Published times are to the minute; the low-precision theory is good to a few minutes. */
const near = (got: number, want: string, minutes = 20) =>
  expect(Math.abs(got - utc(want)) / MIN, `${new Date(got).toISOString()} vs ${want}`).toBeLessThan(
    minutes,
  );

describe("moon phases against published times", () => {
  it("finds the 2024 new and full moons", () => {
    const after = (s: string, phase: string) =>
      nextPhases(utc(s)).find((p) => p.phase === phase)!.at;
    near(after("2024-01-01T00:00", "new"), "2024-01-11T11:57");
    near(after("2024-01-15T00:00", "full"), "2024-01-25T17:54");
    near(after("2024-02-01T00:00", "new"), "2024-02-09T22:59");
    near(after("2024-02-15T00:00", "full"), "2024-02-24T12:30");
    near(after("2024-04-01T00:00", "new"), "2024-04-08T18:21");
  });

  it("lists the next four main phases in order", () => {
    const next = nextPhases(utc("2024-01-12T00:00"));
    expect(next.map((p) => p.phase)).toEqual(["first-quarter", "full", "last-quarter", "new"]);
    expect(next.every((p, i) => i === 0 || p.at > next[i - 1]!.at)).toBe(true);
  });
});

describe("the moon now", () => {
  it("is full, bright and in Leo at the January 2024 full moon", () => {
    const m = moonAt(utc("2024-01-25T17:54"));
    expect(m.phase).toBe("full");
    expect(m.illumination).toBeGreaterThan(0.99);
    expect(m.sign).toBe("Leo");
  });

  it("is new, dark and in Aries at the April 2024 eclipse", () => {
    const m = moonAt(utc("2024-04-08T18:21"));
    expect(m.phase).toBe("new");
    expect(m.illumination).toBeLessThan(0.01);
    expect(m.sign).toBe("Aries");
  });

  it("waxes before full and wanes after", () => {
    expect(moonAt(utc("2024-01-20T00:00")).waxing).toBe(true);
    expect(moonAt(utc("2024-01-30T00:00")).waxing).toBe(false);
    expect(moonAt(utc("2024-01-20T00:00")).phase).toBe("waxing-gibbous");
  });

  it("names phases and signs by slice", () => {
    expect(phaseOf(0)).toBe("new");
    expect(phaseOf(350)).toBe("new");
    expect(phaseOf(30)).toBe("waxing-crescent");
    expect(phaseOf(270)).toBe("last-quarter");
    expect(signOf(0)).toBe("Aries");
    expect(signOf(359.9)).toBe("Pisces");
    expect(signOf(-1)).toBe("Pisces");
  });
});

describe("the Wheel of the Year", () => {
  it("finds the 2024 solstices and equinoxes", () => {
    near(nextSolarPoint(utc("2024-01-01T00:00"), 0), "2024-03-20T03:06");
    near(nextSolarPoint(utc("2024-01-01T00:00"), 90), "2024-06-20T20:51");
    near(nextSolarPoint(utc("2024-01-01T00:00"), 180), "2024-09-22T12:44");
    near(nextSolarPoint(utc("2024-01-01T00:00"), 270), "2024-12-21T09:20");
  });

  it("puts Yule at the December solstice in the north and the June one in the south", () => {
    const from = utc("2024-01-01T00:00");
    near(nextSabbat(from, "yule"), "2024-12-21T09:20");
    near(nextSabbat(from, "yule", "south"), "2024-06-20T20:51");
  });

  it("keeps cross-quarter days on their dates, rolling to next year once past", () => {
    expect(nextSabbat(utc("2024-01-01T00:00"), "samhain")).toBe(utc("2024-10-31T00:00"));
    expect(nextSabbat(utc("2024-10-31T18:00"), "samhain")).toBe(utc("2024-10-31T00:00"));
    // 20:00 on 31 October in New York is already 1 November in UTC: still Samhain there.
    expect(nextSabbat(utc("2024-11-01T00:00"), "samhain", "north", "2024-10-31")).toBe(
      utc("2024-10-31T00:00"),
    );
    // Morning of 1 November in Sydney is still 31 October in UTC: Samhain is over there.
    expect(nextSabbat(utc("2024-10-31T21:00"), "samhain", "north", "2024-11-01")).toBe(
      utc("2025-10-31T00:00"),
    );
    expect(nextSabbat(utc("2024-11-01T00:00"), "samhain")).toBe(utc("2025-10-31T00:00"));
    expect(nextSabbat(utc("2024-01-01T00:00"), "samhain", "south")).toBe(utc("2024-05-01T00:00"));
  });

  it("orders the whole wheel from a day", () => {
    const wheel = wheelOfTheYear(utc("2026-11-01T12:00"));
    expect(wheel.map((w) => w.sabbat)).toEqual([
      "yule",
      "imbolc",
      "ostara",
      "beltane",
      "litha",
      "lughnasadh",
      "mabon",
      "samhain",
    ]);
  });
});
