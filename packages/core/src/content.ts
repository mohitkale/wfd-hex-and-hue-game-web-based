import type { Level } from "./level";
import type { LaunchSource } from "./sim";

/** A shipped level as written by the level pipeline (`npm run levels`). */
export interface BuiltLevel {
  level: Level;
  /** One line for the reveal / Spellbook card. */
  lore: string;
  /** Verified sequential solution. */
  solution: LaunchSource[];
  difficulty: number;
  minSlots: number | null;
  lossRate: number;
  /** Hash of everything that determines the generated puzzle. */
  source: string;
}

export interface BuiltWorld {
  id: string;
  name: string;
  levels: BuiltLevel[];
}
