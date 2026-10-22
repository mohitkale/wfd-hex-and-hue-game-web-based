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
