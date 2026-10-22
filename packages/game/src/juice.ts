import { hexToNumber, luminance, theme } from "./theme";

/**
 * Collections at most this many simulation steps apart belong to one chain. A wisp sweeping a
 * same-colored row collects every step, so a chain is a run of back-to-back collections (by any
 * wisps). Steps, not milliseconds, so 1× and 2× chain alike.
 */
export const COMBO_GAP_STEPS = 3;

/** Chain lengths that earn a combo sparkle: 8, 16, 24, … (shorter runs are too common to cheer). */
export const COMBO_EVERY = 8;

/** Counts back-to-back collections. Pure, deterministic: fed with simulation step numbers. */
export class ComboTracker {
  private last = -Infinity;
  private length = 0;

  /** Records a collection at `step`; returns the chain length including it. */
  hit(step: number): number {
    this.length = step - this.last <= COMBO_GAP_STEPS ? this.length + 1 : 1;
    this.last = step;
    return this.length;
  }

  reset(): void {
    this.last = -Infinity;
    this.length = 0;
  }
}

/** True when a chain of `length` collections should be celebrated. */
export function isComboMilestone(length: number): boolean {
  return length >= COMBO_EVERY && length % COMBO_EVERY === 0;
}

/**
 * Confetti tints for a win: the artwork's palette (too-dark colors dropped so every flake reads
 * on the night sky) plus the game's gold, without duplicates.
 */
export function confettiColors(palette: readonly string[], minLuminance = 0.04): number[] {
  const out = new Set<number>();
  for (const hex of palette) if (luminance(hex) >= minLuminance) out.add(hexToNumber(hex));
  out.add(theme.glow);
  return [...out];
}
