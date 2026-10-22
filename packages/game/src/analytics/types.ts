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
}

export type EventName = keyof EventProps;

/** A provider-agnostic analytics sink. The game never imports a vendor SDK. */
export interface AnalyticsProvider {
  readonly name: string;
  track<E extends EventName>(event: E, props: EventProps[E]): void;
  /** Sends anything queued now (`beacon`: the page is going away). */
  flush(beacon?: boolean): void;
}
