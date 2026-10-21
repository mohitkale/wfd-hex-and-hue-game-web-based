import type { AsciiArt, GenerateOptions } from "@hexhue/core";
import { candleJar, crescent, wishingStar } from "./art/moonlit";

export interface LevelConfig {
  id: string;
  name: string;
  /** One line shown on the reveal / Spellbook card. */
  lore: string;
  art: AsciiArt;
  generate: GenerateOptions;
}

export interface WorldConfig {
  id: string;
  name: string;
  levels: LevelConfig[];
}

/** Gentle defaults; individual levels override what they need. */
const gentle: GenerateOptions = {
  seed: 1,
  columns: 2,
  slots: 5,
  trackCap: 5,
  chunk: { min: 4, max: 10 },
  charges: "reach",
  shuffle: 0,
};

/**
 * Seed content proving the pipeline end to end. World 1 grows to 20 levels in M4.2; Crystal
 * Garden and Zodiac Realm arrive in M4.3 / M4.4.
 */
export const worlds: WorldConfig[] = [
  {
    id: "moonlit",
    name: "Moonlit Beginnings",
    levels: [
      {
        id: "moonlit-01",
        name: "First Crescent",
        lore: "The waxing crescent: a time to set intentions and begin anew.",
        art: crescent,
        generate: { ...gentle, seed: 101 },
      },
      {
        id: "moonlit-02",
        name: "Wishing Star",
        lore: "Stars were once read as messages; make your wish while it shines.",
        art: wishingStar,
        generate: { ...gentle, seed: 102, columns: 3, shuffle: 0.2 },
      },
      {
        id: "moonlit-03",
        name: "Candle Jar",
        lore: "A candle carries an intention into the night long after the spell is spoken.",
        art: candleJar,
        generate: {
          ...gentle,
          seed: 103,
          columns: 3,
          charges: "fixed",
          shuffle: 0.4,
          targetDifficulty: 0.1,
        },
      },
    ],
  },
];
