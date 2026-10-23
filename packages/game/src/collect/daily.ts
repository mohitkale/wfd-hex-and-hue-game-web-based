import { createRng } from "@hexhue/core";

/**
 * The daily challenge schedule (M13.5): which level a calendar day gets. Pure and free of the clock:
 * the same date, pool and `DAILY_VERSION` give the same level on every device, because the only
 * inputs are the date string, the (sorted) pool of level ids and the version, and the only
 * arithmetic is integer. Docs: docs/V2_DAILY.md.
 *
 * The schedule walks the pool in "cycles" of one day per level in a seeded order, so every level
 * comes up once per cycle and never twice in a row. When the pool or this rule changes in a release,
 * bump `DAILY_VERSION`: "the same challenge for the same date and game version" then still holds.
 */

/** Bump whenever the pool or the schedule below changes (a test pins the pool to force this). */
export const DAILY_VERSION = 1;

const DAY_MS = 86_400_000;

/** Days since 1970-01-01 (UTC) for a `YYYY-MM-DD` date, or null if it is not a real calendar day. */
export function dayNumber(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  // Date.UTC rolls 2026-02-31 over into March: accept only dates that survive the round trip.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d)
    return null;
  return ms / DAY_MS;
}

/** `YYYY-MM-DD` (UTC) for a day number. */
export function dayToDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Today's UTC date for an epoch-ms clock reading ("" if the reading is not a date). */
export function utcDate(now: number): string {
  return Number.isFinite(now) && Math.abs(now) < 8.64e15
    ? new Date(now).toISOString().slice(0, 10)
    : "";
}

const mix = (a: number, b: number): number => {
  let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

/** The seeded order of `size` levels for one cycle (before the boundary fix). */
function rawOrder(size: number, cycle: number, version: number): number[] {
  return createRng(mix(version, cycle)).shuffle(Array.from({ length: size }, (_, i) => i));
}

/**
 * Index into a pool of `size` levels for a day number. Every index appears once per cycle of `size`
 * days; for a pool of three or more the first level of a cycle never equals the last of the cycle
 * before, and a pool of two simply alternates, so no level repeats on consecutive days.
 */
export function dailyIndex(day: number, size: number, version = DAILY_VERSION): number {
  if (!Number.isInteger(day) || !Number.isInteger(size) || size < 1)
    throw new Error("bad daily arguments");
  if (size === 1) return 0;
  if (size === 2) return (((day + version) % 2) + 2) % 2;
  const cycle = Math.floor(day / size);
  const at = day - cycle * size;
  const order = rawOrder(size, cycle, version);
  const prevLast = rawOrder(size, cycle - 1, version)[size - 1]!;
  // Swapping positions 0 and 1 never touches the last place, so the next cycle's check stays exact.
  if (order[0] === prevLast) [order[0], order[1]] = [order[1]!, order[0]!];
  return order[at]!;
}

/** The level id for a date, from a pool of ids (sorted here, so listing order never matters), or null. */
export function dailyLevelId(
  date: string,
  pool: readonly string[],
  version = DAILY_VERSION,
): string | null {
  const day = dayNumber(date);
  if (day === null || pool.length === 0) return null;
  const sorted = [...pool].sort();
  return sorted[dailyIndex(day, sorted.length, version)]!;
}
