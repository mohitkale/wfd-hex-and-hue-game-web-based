/**
 * The Living Sky (F3): the moon's phase, light and sign, and the turning points of the Wheel of the
 * Year, worked out on the device with no network. The maths is the classic low-precision theory
 * (J. Meeus, "Astronomical Algorithms": the sun from ch. 25, the moon's longitude from the main
 * terms of ch. 47), good to a few hundredths of a degree: phase times and solstices land within
 * minutes of published tables, which is far closer than any practice needs.
 *
 * Every function takes the instant as milliseconds since 1970 (UTC); the caller reads the clock,
 * so this module stays deterministic (docs/V3_PLAN.md). The zodiac is the tropical one used in
 * modern western astrology.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
/** Mean growth of the moon's elongation from the sun, degrees per day. */
const ELONGATION_PER_DAY = 360 / 29.530588853;

const norm = (deg: number) => ((deg % 360) + 360) % 360;
const sin = (deg: number) => Math.sin(deg * RAD);
const cos = (deg: number) => Math.cos(deg * RAD);

/** Julian centuries since J2000.0 (UT is used for TT; the ~70 s difference does not matter here). */
function centuries(ms: number): number {
  const jd = ms / DAY_MS + 2440587.5;
  return (jd - 2451545.0) / 36525;
}

/** Nutation in longitude (degrees), the main term only. */
function nutation(t: number): number {
  return -0.00478 * sin(125.04 - 1934.136 * t);
}

/** The sun's apparent ecliptic longitude, degrees. */
export function sunLongitude(ms: number): number {
  const t = centuries(ms);
  const l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
  const m = 357.52911 + 35999.05029 * t - 0.0001537 * t * t;
  const c =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * sin(m) +
    (0.019993 - 0.000101 * t) * sin(2 * m) +
    0.000289 * sin(3 * m);
  return norm(l0 + c - 0.00569 + nutation(t));
}

/** Main periodic terms of the moon's longitude: D, M, M', F multipliers and 1e-6 degree amounts. */
const MOON_TERMS: readonly (readonly [number, number, number, number, number])[] = [
  [0, 0, 1, 0, 6288774],
  [2, 0, -1, 0, 1274027],
  [2, 0, 0, 0, 658314],
  [0, 0, 2, 0, 213618],
  [0, 1, 0, 0, -185116],
  [0, 0, 0, 2, -114332],
  [2, 0, -2, 0, 58793],
  [2, -1, -1, 0, 57066],
  [2, 0, 1, 0, 53322],
  [2, -1, 0, 0, 45758],
  [0, 1, -1, 0, -40923],
  [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383],
  [2, 0, 0, -2, 15327],
  [0, 0, 1, 2, -12528],
  [0, 0, 1, -2, 10980],
  [4, 0, -1, 0, 10675],
  [0, 0, 3, 0, 10034],
  [4, 0, -2, 0, 8548],
  [2, 1, -1, 0, -7888],
  [2, 1, 0, 0, -6766],
  [1, 0, -1, 0, -5163],
  [1, 1, 0, 0, 4987],
  [2, -1, 1, 0, 4036],
  [2, 0, 2, 0, 3994],
  [4, 0, 0, 0, 3861],
  [2, 0, -3, 0, 3665],
  [0, 1, -2, 0, -2689],
  [2, 0, -1, 2, -2602],
  [2, -1, -2, 0, 2390],
  [1, 0, 1, 0, -2348],
  [2, -2, 0, 0, 2236],
  [0, 1, 2, 0, -2120],
  [0, 2, 0, 0, -2069],
];

/** The moon's apparent ecliptic longitude, degrees. */
export function moonLongitude(ms: number): number {
  const t = centuries(ms);
  const lp = 218.3164477 + 481267.88123421 * t - 0.0015786 * t * t;
  const d = 297.8501921 + 445267.1114034 * t - 0.0018819 * t * t;
  const m = 357.5291092 + 35999.0502909 * t - 0.0001536 * t * t;
  const mp = 134.9633964 + 477198.8675055 * t + 0.0087414 * t * t;
  const f = 93.272095 + 483202.0175233 * t - 0.0036539 * t * t;
  const e = 1 - 0.002516 * t - 0.0000074 * t * t;
  let sum = 0;
  for (const [cd, cm, cmp, cf, amount] of MOON_TERMS) {
    const scale = Math.abs(cm) === 1 ? e : Math.abs(cm) === 2 ? e * e : 1;
    sum += amount * scale * sin(cd * d + cm * m + cmp * mp + cf * f);
  }
  // The additive terms from Venus, Jupiter and the earth's flattening.
  const a1 = 119.75 + 131.849 * t;
  const a2 = 53.09 + 479264.29 * t;
  sum += 3958 * sin(a1) + 1962 * sin(lp - f) + 318 * sin(a2);
  return norm(lp + sum / 1e6 + nutation(t));
}

/** How far the moon is ahead of the sun, 0…360 degrees: 0 new, 90 first quarter, 180 full. */
export const elongation = (ms: number) => norm(moonLongitude(ms) - sunLongitude(ms));

export const PHASES = [
  "new",
  "waxing-crescent",
  "first-quarter",
  "waxing-gibbous",
  "full",
  "waning-gibbous",
  "last-quarter",
  "waning-crescent",
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_NAMES: Record<Phase, string> = {
  new: "New moon",
  "waxing-crescent": "Waxing crescent",
  "first-quarter": "First quarter",
  "waxing-gibbous": "Waxing gibbous",
  full: "Full moon",
  "waning-gibbous": "Waning gibbous",
  "last-quarter": "Last quarter",
  "waning-crescent": "Waning crescent",
};

export const SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
] as const;
export type Sign = (typeof SIGNS)[number];

export const signOf = (longitude: number): Sign => SIGNS[Math.floor(norm(longitude) / 30)] as Sign;

export interface MoonNow {
  readonly phase: Phase;
  /** Lit fraction of the disc, 0…1. */
  readonly illumination: number;
  readonly waxing: boolean;
  /** Days since the last new moon, roughly. */
  readonly age: number;
  readonly elongation: number;
  readonly longitude: number;
  readonly sign: Sign;
}

/**
 * The phase is one of eight equal slices of the cycle, each centred on its turning point, so "full
 * moon" covers about a day and a half either side of the exact full.
 */
export function phaseOf(elong: number): Phase {
  return PHASES[Math.floor(norm(elong + 22.5) / 45) % 8] as Phase;
}

export function moonAt(ms: number): MoonNow {
  const longitude = moonLongitude(ms);
  const elong = norm(longitude - sunLongitude(ms));
  return {
    phase: phaseOf(elong),
    illumination: (1 - cos(elong)) / 2,
    waxing: elong < 180,
    age: elong / ELONGATION_PER_DAY,
    elongation: elong,
    longitude,
    sign: signOf(longitude),
  };
}

/** The instant after `from` when `angle(ms)` next reaches `target` degrees (both grow steadily). */
function nextCrossing(
  from: number,
  target: number,
  angle: (ms: number) => number,
  perDay: number,
): number {
  const ahead = (ms: number) => norm(target - angle(ms));
  let t = from + (ahead(from) / perDay) * DAY_MS;
  for (let i = 0; i < 8; i++) {
    let gap = ahead(t);
    if (gap > 180) gap -= 360; // overshot: step back
    t += (gap / perDay) * DAY_MS;
    if (Math.abs(gap) < 1e-5) break;
  }
  // Within a minute is all the tables give; a crossing found before `from` means the next cycle.
  return t <= from
    ? nextCrossing(from + DAY_MS, target, angle, perDay)
    : Math.round(t / 60_000) * 60_000;
}

export const MAIN_PHASES = ["new", "first-quarter", "full", "last-quarter"] as const;
export type MainPhase = (typeof MAIN_PHASES)[number];

/** The next new moon, first quarter, full moon and last quarter after `from`, soonest first. */
export function nextPhases(from: number): { phase: MainPhase; at: number }[] {
  return MAIN_PHASES.map((phase, i) => ({
    phase,
    at: nextCrossing(from, i * 90, elongation, ELONGATION_PER_DAY),
  })).sort((a, b) => a.at - b.at);
}

// --- the Wheel of the Year -----------------------------------------------------------------------

export const SABBATS = [
  "imbolc",
  "ostara",
  "beltane",
  "litha",
  "lughnasadh",
  "mabon",
  "samhain",
  "yule",
] as const;
export type Sabbat = (typeof SABBATS)[number];

export const SABBAT_NAMES: Record<Sabbat, string> = {
  imbolc: "Imbolc",
  ostara: "Ostara",
  beltane: "Beltane",
  litha: "Litha",
  lughnasadh: "Lughnasadh",
  mabon: "Mabon",
  samhain: "Samhain",
  yule: "Yule",
};

export type Hemisphere = "north" | "south";

/**
 * Where each sabbat sits in the northern hemisphere: the solstices and equinoxes at the sun's
 * longitude, the cross-quarter days on their traditional calendar dates (month 1–12, day). In the
 * southern hemisphere the wheel turns half a year round: Yule falls at the June solstice.
 */
const NORTH: Record<Sabbat, { sun: number } | { month: number; day: number }> = {
  imbolc: { month: 2, day: 1 },
  ostara: { sun: 0 },
  beltane: { month: 5, day: 1 },
  litha: { sun: 90 },
  lughnasadh: { month: 8, day: 1 },
  mabon: { sun: 180 },
  samhain: { month: 10, day: 31 },
  yule: { sun: 270 },
};

const OPPOSITE: Record<Sabbat, Sabbat> = {
  imbolc: "lughnasadh",
  ostara: "mabon",
  beltane: "samhain",
  litha: "yule",
  lughnasadh: "imbolc",
  mabon: "ostara",
  samhain: "beltane",
  yule: "litha",
};

/** The sun's turning point (solstice or equinox at `longitude` degrees) next after `from`. */
export function nextSolarPoint(from: number, longitude: number): number {
  return nextCrossing(from, longitude, sunLongitude, 360 / 365.2422);
}

/**
 * When `sabbat` next comes after `from`, for a hemisphere. Solstices and equinoxes are exact
 * instants. A cross-quarter day is a calendar date, given as that date's midnight UTC (read it with
 * the UTC getters), and is judged against `today`, the learner's own local date (`YYYY-MM-DD`;
 * by default the UTC date of `from`), so it stays "next" all through its day wherever they live.
 */
export function nextSabbat(
  from: number,
  sabbat: Sabbat,
  hemisphere: Hemisphere = "north",
  today: string = new Date(from).toISOString().slice(0, 10),
): number {
  const when = NORTH[hemisphere === "north" ? sabbat : OPPOSITE[sabbat]];
  if ("sun" in when) return nextSolarPoint(from, when.sun);
  const start = Date.parse(`${today}T00:00:00Z`);
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const at = Date.UTC(y, when.month - 1, when.day);
    if (at >= start) return at;
  }
  return Date.UTC(year + 1, when.month - 1, when.day);
}

/** Every sabbat's next date after `from`, soonest first. */
export function wheelOfTheYear(
  from: number,
  hemisphere: Hemisphere = "north",
  today?: string,
): { sabbat: Sabbat; at: number }[] {
  return SABBATS.map((sabbat) => ({
    sabbat,
    at: nextSabbat(from, sabbat, hemisphere, today),
  })).sort((a, b) => a.at - b.at);
}
