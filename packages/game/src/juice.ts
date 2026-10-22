import { hexToNumber, luminance, theme } from "./theme";

/**
 * Collections by one wisp at most this many simulation steps apart belong to one chain: a wisp
 * sweeping a same-colored row collects every step. Chains are per wisp (with several wisps on the
 * track a shared chain would never break), and counted in steps, so 1× and 2× chain alike.
 */
export const COMBO_GAP_STEPS = 3;

/** Chain lengths that earn a combo sparkle: 8, 16, 24, … (shorter runs are too common to cheer). */
export const COMBO_EVERY = 8;

/** Counts each wisp's back-to-back collections. Pure, deterministic: fed with step numbers. */
export class ComboTracker {
  private chains = new Map<number, { last: number; length: number }>();

  /** Records a collection by `wispId` at `step`; returns that wisp's chain length including it. */
  hit(wispId: number, step: number): number {
    const chain = this.chains.get(wispId);
    const length = chain && step - chain.last <= COMBO_GAP_STEPS ? chain.length + 1 : 1;
    this.chains.set(wispId, { last: step, length });
    return length;
  }

  /** The wisp left the track (portal or parked); its chain ends. */
  end(wispId: number): void {
    this.chains.delete(wispId);
  }

  reset(): void {
    this.chains.clear();
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
