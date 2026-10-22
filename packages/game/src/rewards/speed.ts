import type { RewardsProvider } from "./types";
import { safeShow } from "./providers";

/**
 * 2× speed unlock policy (GAME_DESIGN §3): unlocks alternate free → ad → free → ad, counted by
 * `turns` (persisted). 1× is always available. On an ad turn:
 * - ad watched → 2× now, next unlock is free;
 * - player closes the ad → no change (they can try again or play at 1×);
 * - no ad available (no network, no fill, error) → stays 1× this level, next unlock is free.
 */
export type SpeedOffer = "free" | "ad";

export const speedOffer = (turns: number): SpeedOffer => (turns % 2 === 0 ? "free" : "ad");

export interface SpeedOutcome {
  granted: boolean;
  /** The new persisted turn count. */
  turns: number;
  /** A short explanation when 2× wasn't granted. */
  message?: string;
}

export async function unlockSpeed(turns: number, provider: RewardsProvider): Promise<SpeedOutcome> {
  if (speedOffer(turns) === "free") return { granted: true, turns: turns + 1 };
  const result = provider.isAvailable("speed2x")
    ? await safeShow(provider, "speed2x")
    : "unavailable";
  if (result === "rewarded") return { granted: true, turns: turns + 1 };
  if (result === "dismissed") return { granted: false, turns };
  return { granted: false, turns: turns + 1, message: "No ad right now — 2× is free next level" };
}

export interface SpeedButtonInput {
  /** 2× already unlocked this level. */
  unlocked: boolean;
  /** An ad turn found no ad this level: 1× for the rest of it (next level is free). */
  declined: boolean;
  speed: 1 | 2;
  turns: number;
  adAvailable: boolean;
}

export interface SpeedButton {
  label: string;
  /** What a tap does: switch 1×/2×, try to unlock, or just explain (no unlock possible now). */
  action: "toggle" | "unlock" | "explain";
}

/**
 * The HUD speed button for the current state. Never advertises an ad that can't play, and never
 * re-offers 2× in the same level after an ad turn came up empty.
 */
export function speedButton(s: SpeedButtonInput): SpeedButton {
  if (s.unlocked) return { label: `${s.speed}×`, action: "toggle" };
  if (s.declined) return { label: "1×", action: "explain" };
  if (speedOffer(s.turns) === "free") return { label: "2× free", action: "unlock" };
  return s.adAvailable ? { label: "2× ▶", action: "unlock" } : { label: "2×", action: "unlock" };
}
