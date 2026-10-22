import type Phaser from "phaser";
import { NoneProvider } from "./providers";
import type { RewardsProvider } from "./types";

export { MockProvider, NoneProvider, createRewards, safeShow } from "./providers";
export {
  speedButton,
  speedOffer,
  unlockSpeed,
  type SpeedButton,
  type SpeedButtonInput,
  type SpeedOffer,
  type SpeedOutcome,
} from "./speed";
export type { AdResult, Placement, RewardsProvider } from "./types";

/** The game's rewards provider (a no-op provider if none was registered). */
export function getRewards(scene: Phaser.Scene): RewardsProvider {
  return (scene.registry.get("rewards") as RewardsProvider | undefined) ?? new NoneProvider();
}

/** Coins granted by the "short on coins" ad offer. */
export const AD_COINS = 30;
