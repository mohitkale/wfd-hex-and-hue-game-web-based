import { moonlit } from "./worlds/moonlit";
import type { WorldConfig } from "./types";

export type { LevelConfig, WorldConfig } from "./types";

/**
 * Every world, in play order. Each world lives in content/worlds/<id>.ts; its art in
 * content/art/<id>.ts. World 1 is complete; Crystal Garden and Zodiac Realm arrive in M4.3 / M4.4.
 */
export const worlds: WorldConfig[] = [moonlit];
