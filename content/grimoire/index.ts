/**
 * The Grimoire's lessons (v3; docs/V3_PLAN.md). Each entry is checked by `npm run grimoire:check`
 * (packages/learn/src/grimoire.ts) and stays a draft, hidden from players, until a practitioner
 * has reviewed it.
 */
import type { GrimoireEntry } from "@hexhue/learn";
import { candleIntention } from "./candle";
import { castingCircle } from "./circle";
import { elementsWelcome } from "./elements";
import { MOON_QUESTS } from "./moon";
import { yule } from "./yule";

export const GRIMOIRE: readonly GrimoireEntry[] = [
  elementsWelcome,
  castingCircle,
  candleIntention,
  ...Object.values(MOON_QUESTS),
  yule,
];

export { MOON_QUESTS };
