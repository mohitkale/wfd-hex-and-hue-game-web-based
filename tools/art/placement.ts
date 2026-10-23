import { stageForLevel } from "../../content/curveV2";
import type { Tier } from "../../content/difficulty";

/**
 * Where the preview library sits on the difficulty curve (content/curveV2.ts, docs/V2_CURVE.md).
 *
 * `PREVIEW_LEVEL`: the pieces placed at a level number; `art:levels` generates each for its stage's
 * tier and **fails if the generated level deviates from the curve** (tools/art/levels.ts). A piece is
 * only placed if it can meet its stage: the library has three lossless tutorial-grade pictures for
 * the three lossless slots of the first stage and nothing else that fits.
 *
 * `UNPLACED_TIER`: pieces that are generated for a tier but are not on the curve. The black cat is
 * easy for the cheap players (they win some, not all) but has no dead end along its winning line,
 * which the easy band and stage 2 require, so it cannot be placed.
 *
 * `EXTRA_LEVEL`: other measured levels placed on the curve for the report and tests (the
 * hand-designed slice).
 */
export const PREVIEW_LEVEL: Record<string, number> = {
  "crescent-moon": 1,
  "triple-moon": 2,
  "witchs-cauldron": 3,
};
export const UNPLACED_TIER: Record<string, Tier> = { "black-cat": "easy" };
export const EXTRA_LEVEL: Record<string, number> = { "slice-moonlit-hat": 16 };

export const DEFAULT_TIER: Tier = "tutorial";

/** A piece's target tier: its stage's, if it is on the curve, else its unplaced tier or tutorial. */
export const tierFor = (pieceId: string): Tier => {
  const level = PREVIEW_LEVEL[pieceId];
  return level !== undefined ? stageForLevel(level).tier : (UNPLACED_TIER[pieceId] ?? DEFAULT_TIER);
};
