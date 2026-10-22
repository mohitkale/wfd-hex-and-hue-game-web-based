import { crystal } from "./worlds/crystal";
import { moonlit } from "./worlds/moonlit";
import { zodiac } from "./worlds/zodiac";
import type { WorldConfig } from "./types";

export type { LevelConfig, WorldConfig } from "./types";

/**
 * Every world, in play order. Each world lives in content/worlds/<id>.ts; its art in
 * content/art/<id>.ts. Worlds 4–6 (Familiar Forest, Arcane Library, Celestial Kingdom) come later.
 */
export const worlds: WorldConfig[] = [moonlit, crystal, zodiac];
