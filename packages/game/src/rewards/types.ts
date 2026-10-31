/**
 * Where a rewarded ad is offered. Providers may report fill per placement. The only one is the
 * optional 3× speed for a level (its id keeps its first name, so the analytics stay comparable).
 */
export type Placement = "speed2x";

/**
 * - `rewarded`: the ad finished; grant the reward.
 * - `dismissed`: the player closed it early; grant nothing, change nothing.
 * - `unavailable`: no provider, no fill, or an error; the game carries on without it.
 */
export type AdResult = "rewarded" | "dismissed" | "unavailable";

/**
 * Any rewarded-ad network (Google Ad Manager rewarded web ads, CrazyGames SDK, …) plugs in behind
 * this. The game never imports a vendor SDK directly, and never depends on an ad succeeding.
 */
export interface RewardsProvider {
  readonly name: string;
  /** Best guess whether `show` would fill right now (cheap; called to decide what to offer). */
  isAvailable(placement: Placement): boolean;
  /** Shows a rewarded ad. Must always resolve (never reject, never hang forever). */
  show(placement: Placement): Promise<AdResult>;
}
