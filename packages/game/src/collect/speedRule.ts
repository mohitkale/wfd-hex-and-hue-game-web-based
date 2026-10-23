import type { AdResult } from "../rewards/types";

/**
 * The v2 speed rule (M14.3, docs/V2_SPEED.md): 1× is always free; 2× unlocks for the **current level
 * only**, through an optional rewarded ad. Pure and free of Phaser, so every branch is tested.
 *
 * - No working provider: **no 2× offer is shown** (never an ad that cannot play).
 * - A completed ad unlocks 2× for this level; closing it early changes nothing (it may be tried again);
 *   an ad that cannot be shown ("unavailable") withdraws the offer for this level and says so.
 * - Nothing here touches the game: speed is how many ticks are shown per second (`TickClock`), so the
 *   outcome of a given action log is the same at 1× and 2× (tested).
 */

export interface SpeedState {
  /** The level id 2× is unlocked for, or null. A different level starts at 1× again. */
  unlockedFor: string | null;
  /** The level id whose ad could not be shown, so the offer is not repeated there. */
  declinedFor: string | null;
  /** An ad is on screen right now. */
  adPending: boolean;
}

export const initialSpeedState = (): SpeedState => ({
  unlockedFor: null,
  declinedFor: null,
  adPending: false,
});

export interface SpeedView {
  /** Whether the HUD shows a speed button at all. */
  show: boolean;
  label: string;
  /** What a tap does: switch 1×/2×, watch the ad, or stop waiting for one that is on screen. */
  action: "toggle" | "watch" | "cancel" | "none";
}

export interface SpeedInput {
  levelId: string;
  state: SpeedState;
  /** The provider can show a rewarded ad for 2× right now. */
  providerAvailable: boolean;
  /** The speed in use (only 2 once unlocked). */
  speed: 1 | 2;
}

/** The HUD's speed button for the current situation. */
export function speedView(i: SpeedInput): SpeedView {
  if (i.state.unlockedFor === i.levelId)
    return { show: true, label: `${i.speed}×`, action: "toggle" };
  // While an ad is up the button can end the wait, so a provider that hangs never traps the game.
  if (i.state.adPending) return { show: true, label: "…", action: "cancel" };
  if (!i.providerAvailable || i.state.declinedFor === i.levelId)
    return { show: false, label: "", action: "none" };
  return { show: true, label: "2×▶", action: "watch" };
}

export interface AdOutcome {
  state: SpeedState;
  /** Play at 2× now. */
  speed: 1 | 2;
  /** A short line for the player, or null. */
  message: string | null;
}

/** What an ad's result changes. Never throws, and `speed` stays 1 unless the ad was completed. */
export function applyAdResult(state: SpeedState, levelId: string, result: AdResult): AdOutcome {
  const idle = { ...state, adPending: false };
  if (result === "rewarded")
    return {
      state: { ...idle, unlockedFor: levelId },
      speed: 2,
      message: "2× unlocked for this level",
    };
  if (result === "dismissed") return { state: idle, speed: 1, message: null };
  return {
    state: { ...idle, declinedFor: levelId },
    speed: 1,
    message: "No ad right now. Playing at 1×",
  };
}

/** Starting a level: 2× only if it was unlocked for this very level; an ad in flight is gone. */
export function enterLevel(state: SpeedState, levelId: string): SpeedState {
  return {
    unlockedFor: state.unlockedFor === levelId ? levelId : null,
    declinedFor: state.declinedFor === levelId ? levelId : null,
    adPending: false,
  };
}

/**
 * The speed state when a level starts (M14.3): what was kept in the session, narrowed to this level,
 * and the speed that goes with it. 2× is only ever restored for the level it was unlocked for. The
 * review override (`?speed=2`, development builds only; it is not an ad reward) unlocks the level.
 */
export function restoreSpeed(
  kept: SpeedState | undefined,
  keptSpeed: unknown,
  levelId: string,
  reviewOverride: boolean,
): { state: SpeedState; speed: 1 | 2 } {
  let state = enterLevel(kept ?? initialSpeedState(), levelId);
  let speed: 1 | 2 = state.unlockedFor === levelId && keptSpeed === 2 ? 2 : 1;
  if (reviewOverride) {
    state = { ...state, unlockedFor: levelId };
    speed = 2;
  }
  return { state, speed };
}
