import * as collect from "@hexhue/core/collect";
import { checkStrategies, type Tier } from "../../content/difficulty";

/**
 * The anti-triviality gate (M12.3): a candidate level is acceptable for a tier only if the cheap
 * simulated players behave as the tier's band demands (docs/DIFFICULTY_V2.md §5): tutorial and easy
 * levels may be beaten by simple play, medium and hard levels must not be (column-spam must lose,
 * only a few cheap players may win), without penalising the solver or a human's clever line.
 */
export const gateFor =
  (tier: Tier) =>
  (level: collect.CollectLevel): string[] =>
    checkStrategies(collect.strategyReport(level), tier);

/** Generator profiles worth trying for a tier, easiest-fitting first. */
export const PROFILES_FOR_TIER: Readonly<Record<Tier, collect.Profile[]>> = {
  tutorial: ["gentle"],
  easy: ["gentle", "standard"],
  medium: ["standard", "tight"],
  hard: ["tight", "standard"],
};

/** Generates a level for a picture and a tier, or null if no profile can meet the tier's player rules. */
export function generateForTier(
  art: collect.GeneratorArt,
  id: string,
  name: string,
  tier: Tier,
  seed = 1,
): (collect.Generated & { profile: collect.Profile }) | null {
  for (const profile of PROFILES_FOR_TIER[tier]) {
    const g = collect.generateLevel(art, id, name, { seed, profile, gate: gateFor(tier) });
    if (g) return { ...g, profile };
  }
  return null;
}
