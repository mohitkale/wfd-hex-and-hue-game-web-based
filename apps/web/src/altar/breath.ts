/**
 * Hold-to-breathe: hold while the light grows (breathing in), let go while it fades (breathing out).
 * A hold long enough counts as one breath; a short one is a gentle "a little longer". Times in ms,
 * passed in, so this is testable without a clock.
 */
export const MIN_HOLD_MS = 1500;

export interface BreathState {
  readonly count: number;
  readonly since: number | null;
}

export const startBreaths = (): BreathState => ({ count: 0, since: null });

export function pressBreath(s: BreathState, now: number): BreathState {
  return s.since === null ? { ...s, since: now } : s;
}

export function releaseBreath(
  s: BreathState,
  now: number,
): { state: BreathState; counted: boolean } {
  if (s.since === null) return { state: s, counted: false };
  const counted = now - s.since >= MIN_HOLD_MS;
  return { state: { count: s.count + (counted ? 1 : 0), since: null }, counted };
}
