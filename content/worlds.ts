import { crystal } from "./worlds/crystal";
import { moonlit } from "./worlds/moonlit";
import type { WorldConfig } from "./types";

export type { LevelConfig, WorldConfig } from "./types";

/**
 * Every world, in play order. Each world lives in content/worlds/<id>.ts; its art in
 * content/art/<id>.ts. Zodiac Realm arrives in M4.4.
 */
export const worlds: WorldConfig[] = [moonlit, crystal];
