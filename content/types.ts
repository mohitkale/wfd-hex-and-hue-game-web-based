import type { AsciiArt, GenerateOptions } from "@hexhue/core";

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
