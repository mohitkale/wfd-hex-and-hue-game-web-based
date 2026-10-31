import type { AdResult } from "../rewards/types";

/**
 * The key funnel events and their (anonymous) properties. No personal data: level ids, counts,
 * durations and choices only.
 */
export interface EventProps {
  /** The game was opened; `standalone` = launched as an installed app. */
  app_open: { standalone: boolean };
  /** A rewarded ad was offered and this is how it ended. */
  ad_result: { placement: string; result: AdResult };

  // v2 gameplay quality (M14.5, docs/V2_ANALYTICS.md). Level ids, counts, seconds and choices only.
  /** An attempt began (`replay`: not the first attempt of this visit to the level). */
  play_start: { level: string; kind: PlayKind; replay: boolean };
  /** The first summon or resume of an attempt, `seconds` of active play after it began. */
  play_first_move: { level: string; seconds: number };
  play_win: { level: string; seconds: number; moves: number; boosters: number };
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
  /** An Extra Slot, Hint or power-up was used (hint usage is `booster: "hint"`). */
  play_booster: {
    level: string;
    booster: "extraSlot" | "hint" | "call" | "sweep" | "lantern";
    paid: PlayPaid;
  };
  /** Whether the optional rewarded 3× ad could be offered on this level (completion is `ad_result`). */
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
