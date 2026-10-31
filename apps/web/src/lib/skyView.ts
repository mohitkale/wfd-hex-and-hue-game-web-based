import type { Hemisphere } from "@hexhue/learn";

/**
 * Drawing and wording helpers for the Living Sky pages (moon tracker, Wheel of the Year). Pure, so
 * they are tested; the pages read the clock and the stored hemisphere.
 */

export const HEMISPHERE_KEY = "hexhue.v3.hemisphere";

export function readHemisphere(store: Pick<Storage, "getItem"> | null): Hemisphere {
  try {
    return store?.getItem(HEMISPHERE_KEY) === "south" ? "south" : "north";
  } catch {
    return "north";
  }
}

/**
 * The lit part of the moon as an SVG path in a circle of radius `r` at (`r`, `r`), as seen from the
 * northern hemisphere (waxing lit on the right); the page mirrors it for the southern one.
 */
export function moonPath(elongation: number, r: number): string {
  const e = ((elongation % 360) + 360) % 360;
  const c = Math.cos((e * Math.PI) / 180);
  const rx = Math.abs(c) * r;
  const waxing = e < 180;
  const top = `${r},0`;
  const bottom = `${r},${2 * r}`;
  const limb = waxing ? `A${r},${r} 0 0 1 ${bottom}` : `A${r},${r} 0 0 0 ${bottom}`;
  const sweep = waxing ? (c > 0 ? 0 : 1) : c < 0 ? 0 : 1;
  return `M${top} ${limb} A${rx.toFixed(2)},${r} 0 0 ${sweep} ${top} Z`;
}

/** Whole days from `now` to `at`, counting calendar days in the learner's time zone. */
export function daysUntil(now: Date, at: Date): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(at) - day(now)) / 86_400_000);
}

export function whenText(now: Date, at: Date): string {
  const n = daysUntil(now, at);
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

/** A calendar date given as its midnight UTC (a cross-quarter day), as a local date that day. */
export function calendarDate(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function dateText(at: Date, withTime = false): string {
  return at.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}
