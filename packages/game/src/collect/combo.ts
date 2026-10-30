/**
 * Combos (M15.13, owner request: more fun): boxes finished one soon after another make a streak, and
 * from the second one on a word of praise pops up. Cosmetic only; it never changes play or rewards.
 * Pure, so it is tested without Phaser.
 */
export interface Combo {
  /** Boxes in the current streak. */
  count: number;
  /** When the last one finished (ms, game time scaled by speed so 3× does not make streaks easier). */
  at: number;
}

export const NO_COMBO: Combo = { count: 0, at: -Infinity };

/** A box finished within this long of the last one keeps the streak going (ms of play at 1×). */
export const COMBO_WINDOW_MS = 3000;

const WORDS = ["Nice!", "Great!", "Wonderful!", "Spellbinding!"] as const;

/** The streak after a box finishes at `now`, and the word to show (null for the first of a streak). */
export function comboAfter(prev: Combo, now: number): { combo: Combo; word: string | null } {
  const count = now - prev.at <= COMBO_WINDOW_MS ? prev.count + 1 : 1;
  const word = count < 2 ? null : WORDS[Math.min(count - 2, WORDS.length - 1)]!;
  return { combo: { count, at: now }, word };
}
