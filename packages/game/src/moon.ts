/**
 * The real moon tonight, for the world map's sky. Based on the mean synodic month from a known
 * new moon; accurate to well under a day, which is plenty for a phase name and a drawing.
 */
export const SYNODIC_DAYS = 29.530588853;
/** A new moon: 2000-01-06 18:14 UTC. */
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const DAY_MS = 86_400_000;

/** Phase as a fraction of the cycle: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(date: Date): number {
  const days = (date.getTime() - REFERENCE_NEW_MOON) / DAY_MS;
  const p = (days / SYNODIC_DAYS) % 1;
  return p < 0 ? p + 1 : p;
}

/** Fraction of the disc that is lit (0..1). */
export function illumination(phase: number): number {
  return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

const NAMES = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
] as const;

export type PhaseName = (typeof NAMES)[number];

/** New, quarter and full moon names apply within a day of the exact moment. */
const PRINCIPAL_WINDOW = 1 / SYNODIC_DAYS;

/**
 * The traditional name. New, first quarter, full and last quarter are moments: their names
 * apply within a day of them, and the crescent / gibbous names cover the days between.
 */
export function phaseName(phase: number): PhaseName {
  const p = ((phase % 1) + 1) % 1;
  for (let k = 0; k <= 4; k++) {
    if (Math.abs(p - k / 4) <= PRINCIPAL_WINDOW) return NAMES[(k * 2) % 8]!;
  }
  return NAMES[Math.floor(p * 4) * 2 + 1]!;
}

/**
 * Whether point (x, y) of the unit disc (x right, y down, both -1..1) is lit at `phase`, as seen
 * from the northern hemisphere: waxing lights the right side first, waning keeps the left.
 */
export function isLit(x: number, y: number, phase: number): boolean {
  if (x * x + y * y > 1) return false;
  const half = Math.sqrt(1 - y * y);
  const terminator = half * Math.cos(2 * Math.PI * phase);
  return phase <= 0.5 ? x > terminator : x < -terminator;
}
