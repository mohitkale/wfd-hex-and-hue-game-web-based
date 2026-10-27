import type { AdResult } from "../rewards/types";

/**
 * The v2 speed rule (M14.3, docs/V2_SPEED.md): 1× is always free; the speed-up (3×) unlocks for the
 * **current level only**, through an optional rewarded ad; and the last deliveries sprint at 3× for
 * free (`sprinting`). Pure and free of Phaser, so every branch is tested.
 *
 * - No working provider: **no 3× offer is shown** (never an ad that cannot play).
 * - A completed ad unlocks 3× for this level; closing it early changes nothing (it may be tried again);
 *   an ad that cannot be shown ("unavailable") withdraws the offer for this level and says so.
 * - Nothing here touches the game: speed is how many ticks are shown per second (`TickClock`), so the
 *   outcome of a given action log is the same at 1× and 3× (tested).
 */

/** The speed the optional ad unlocks (and the free end-game sprint uses). */
export const BOOST = 3;
export type Speed = 1 | typeof BOOST;

export interface SpeedState {
  /** The level id 3× is unlocked for, or null. A different level starts at 1× again. */
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
  /** What a tap does: switch 1×/3×, watch the ad, or stop waiting for one that is on screen. */
  action: "toggle" | "watch" | "cancel" | "none";
}

export interface SpeedInput {
  levelId: string;
  state: SpeedState;
  /** The provider can show a rewarded ad for 3× right now. */
  providerAvailable: boolean;
  /** The speed in use (only 3 once unlocked). */
  speed: Speed;
}

/** The HUD's speed button for the current situation. */
export function speedView(i: SpeedInput): SpeedView {
  if (i.state.unlockedFor === i.levelId)
    return { show: true, label: `${i.speed}×`, action: "toggle" };
  // While an ad is up the button can end the wait, so a provider that hangs never traps the game.
  if (i.state.adPending) return { show: true, label: "…", action: "cancel" };
  if (!i.providerAvailable || i.state.declinedFor === i.levelId)
    return { show: false, label: "", action: "none" };
  return { show: true, label: "3×▶", action: "watch" };
}

export interface AdOutcome {
  state: SpeedState;
  /** Play at 3× now. */
  speed: Speed;
  /** A short line for the player, or null. */
  message: string | null;
}

/** What an ad's result changes. Never throws, and `speed` stays 1 unless the ad was completed. */
export function applyAdResult(state: SpeedState, levelId: string, result: AdResult): AdOutcome {
  const idle = { ...state, adPending: false };
  if (result === "rewarded")
    return {
      state: { ...idle, unlockedFor: levelId },
      speed: BOOST,
      message: "3× unlocked for this level",
    };
  if (result === "dismissed") return { state: idle, speed: 1, message: null };
  return {
    state: { ...idle, declinedFor: levelId },
    speed: 1,
    message: "No ad right now. Playing at 1×",
  };
}

/** Starting a level: 3× only if it was unlocked for this very level; an ad in flight is gone. */
export function enterLevel(state: SpeedState, levelId: string): SpeedState {
  return {
    unlockedFor: state.unlockedFor === levelId ? levelId : null,
    declinedFor: state.declinedFor === levelId ? levelId : null,
    adPending: false,
  };
}

/**
 * The speed state when a level starts (M14.3): what was kept in the session, narrowed to this level,
 * and the speed that goes with it. 3× is only ever restored for the level it was unlocked for. The
 * review override (`?speed=3`, development builds only; it is not an ad reward) unlocks the level.
 */
export function restoreSpeed(
  kept: SpeedState | undefined,
  keptSpeed: unknown,
  levelId: string,
  reviewOverride: boolean,
): { state: SpeedState; speed: Speed } {
  let state = enterLevel(kept ?? initialSpeedState(), levelId);
  let speed: Speed = state.unlockedFor === levelId && keptSpeed === BOOST ? BOOST : 1;
  if (reviewOverride) {
    state = { ...state, unlockedFor: levelId };
    speed = BOOST;
  }
  return { state, speed };
}

/**
 * The free end-game sprint: once no player decision is left (nothing queued in a column and nothing
 * waiting in a slot), every remaining cube belongs to a group that is already working, so the rest of
 * the level plays itself and is shown at 3× without an ad. It changes how fast ticks are shown, never
 * what happens (a group that runs dry parks, which ends the sprint by itself).
 */
export function sprinting(s: {
  status: string;
  columns: readonly (readonly number[])[];
  slots: readonly (number | null)[];
  groups: readonly { status: string }[];
}): boolean {
  return (
    s.status === "playing" &&
    s.columns.every((c) => c.length === 0) &&
    s.slots.every((x) => x === null) &&
    s.groups.some((g) => g.status === "working")
  );
}

/** The speed to show now: the chosen one, or 3× while the level is finishing by itself. */
export const effectiveSpeed = (chosen: Speed, sprint: boolean): Speed => (sprint ? BOOST : chosen);
