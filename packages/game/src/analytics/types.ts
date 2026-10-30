import type { AdResult } from "../rewards/types";

/**
 * The key funnel events and their (anonymous) properties. No personal data: level ids, counts,
 * durations and choices only.
 */
export interface EventProps {
  /** The game was opened; `standalone` = launched as an installed app. */
  app_open: { standalone: boolean };
  level_start: { level: string; replay: boolean };
  /**
   * `seconds` counts active play only (not ads, menus or a hidden tab). `recovered`: this attempt
   * had already sent a `level_lose` and was continued by revive or undo.
   */
  level_win: { level: string; stars: number; assists: number; seconds: number; recovered: boolean };
  level_lose: { level: string; seconds: number };
  level_skip: { level: string };
  /** Left the level mid-attempt (Back while still playing): where players stop. */
  level_quit: { level: string; seconds: number };
  /** An onboarding tip was read. */
  tutorial_tip: { tip: string };
  booster_use: { level: string; booster: string; paid: "owned" | "coins" };
  /** A rewarded ad was offered and this is how it ended. */
  ad_result: { placement: string; result: AdResult };
  install_prompt: { accepted: boolean };

  // v2 gameplay quality (M14.5, docs/V2_ANALYTICS.md). Level ids, counts, seconds and choices only.
  /** An attempt began (`replay`: not the first attempt of this visit to the level). */
  play_start: { level: string; kind: PlayKind; replay: boolean };
  /** The first summon or resume of an attempt, `seconds` of active play after it began. */
  play_first_move: { level: string; seconds: number };
  play_win: { level: string; seconds: number; moves: number; undos: number; boosters: number };
  play_loss: {
    level: string;
    seconds: number;
    moves: number;
    reason: "slotsFull" | "deadlock";
  };
  /** Retry pressed; `after` says how the attempt stood. */
  play_retry: { level: string; after: "playing" | "won" | "lost"; seconds: number };
  /** Left an attempt unfinished (a new level, the page closing). */
  play_abandon: { level: string; seconds: number; moves: number };
  /** An Undo was used; `paid` says how it was paid for ("free" in the tutorial). */
  play_undo: { level: string; paid: PlayPaid };
  /** An Extra Slot, Hint or power-up was used (hint usage is `booster: "hint"`). */
  play_booster: {
    level: string;
    booster: "extraSlot" | "hint" | "call" | "sweep" | "lantern";
    paid: PlayPaid;
  };
  /** Whether the optional rewarded 2× ad could be offered on this level (completion is `ad_result`). */
  play_ad_offer: { level: string; placement: string; available: boolean };
}

export type PlayKind = "tutorial" | "daily" | "picture" | "other";
export type PlayPaid = "owned" | "coins" | "free";

export type EventName = keyof EventProps;

/** A provider-agnostic analytics sink. The game never imports a vendor SDK. */
export interface AnalyticsProvider {
  readonly name: string;
  track<E extends EventName>(event: E, props: EventProps[E]): void;
  /** Sends anything queued now (`beacon`: the page is going away). */
  flush(beacon?: boolean): void;
}
