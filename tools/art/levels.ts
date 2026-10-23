/**
 * Playable preview levels for the v2 art library (M11.5): each piece becomes a `CollectLevel` with
 * its shades and subject, so a win can reveal the picture and unlock it in the Spellbook.
 *
 *   npm run art:levels     # rewrites packages/game/src/collect/generated/art-levels.json
 *
 * The groups come from the generator (M12.2): seeded, solver-verified, structure-checked. The output
 * is committed, and a test fails when it is stale. Whether cheap play beats a level is M12.3.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as collect from "@hexhue/core/collect";
import { pieces } from "../../content/v2art";
import { encodeArtLevel, type ArtGenerated } from "../../packages/game/src/collect/artLevelCodec";
import { stageForLevel } from "../../content/curveV2";
import type { Tier } from "../../content/difficulty";
import { generateForTier } from "../collect/tierGate";
import { pieceToArt, type ArtPiece } from "./piece";

export const OUTPUT = new URL(
  "../../packages/game/src/collect/generated/art-levels.json",
  import.meta.url,
);

/**
 * Where each piece sits on the difficulty curve (content/curveV2.ts, docs/V2_CURVE.md): its target
 * level number, from which the curve gives its tier. Only pieces that can meet their stage are
 * placed: the library has five tutorial-grade lossless pictures for the three lossless slots of the
 * first stage, and nothing that reaches stage 3 or later. Unplaced pieces are generated as tutorial
 * levels and are not part of the curve.
 */
export const PREVIEW_LEVEL: Record<string, number> = {
  "crescent-moon": 1,
  "triple-moon": 2,
  "witchs-cauldron": 3,
  "black-cat": 6,
};
export const DEFAULT_TIER: Tier = "tutorial";
export const SEED = 1;

/** A piece's target tier: its stage's, if it is on the curve. */
export const tierFor = (id: string): Tier => {
  const level = PREVIEW_LEVEL[id];
  return level === undefined ? DEFAULT_TIER : stageForLevel(level).tier;
};

export interface ArtLevel {
  level: collect.CollectLevel;
  generated: ArtGenerated;
}

/** Generates a piece's level (M12.2) for its tier (M12.3), adding its shades and subject. */
export function levelForPiece(piece: ArtPiece): ArtLevel {
  const { art, shades } = pieceToArt(piece);
  const tier = tierFor(piece.id);
  const g = generateForTier(art, `art-${piece.id}`, piece.name, tier, SEED);
  if (!g) throw new Error(`${piece.id}: no level meets the ${tier} band`);
  const report = collect.strategyReport(g.level);
  const measured = collect.measureLevel(g.level);
  if (!measured) throw new Error(`${piece.id}: the generated level could not be measured`);
  const score = collect.difficultyScore(measured);
  return {
    level: {
      ...g.level,
      shades,
      subject: { id: piece.id, name: piece.name, theme: piece.theme, lore: piece.lore },
    },
    generated: {
      profile: g.profile,
      seed: SEED,
      attempt: g.attempt,
      score: g.score,
      metrics: g.metrics,
      tier,
      strategies: { wins: report.wins, randomRate: report.randomRate },
      difficulty: {
        score: round(score.total),
        components: Object.fromEntries(score.components.map((c) => [c.id, round(c.points)])),
        measures: {
          deadEndShare: round(measured.deadEndShare),
          doomedFirstShare: round(measured.doomedFirstShare),
          temptingPoorShare: round(measured.temptingPoorShare),
          planningDepth: Number.isFinite(measured.planningDepth) ? measured.planningDepth : null,
          effectiveBranching: round(measured.effectiveBranching),
          slotPressure: round(measured.slotPressure),
          hiddenColors: measured.hiddenColors,
          recoveryDepth: measured.recoveryDepth,
          recoverableShare: round(measured.recoverableShare),
          strategyGap: round(measured.strategyGap),
          seconds: Math.round(measured.seconds),
          truncated:
            measured.truncated.winningShare ||
            measured.truncated.solutions ||
            measured.truncated.planning,
        },
      },
    },
  };
}

const round = (x: number): number => Math.round(x * 1000) / 1000;

export const artLevels = (): ArtLevel[] => pieces.map(levelForPiece);

export const serialize = (levels: ArtLevel[]): string =>
  JSON.stringify(
    levels.map((l) => encodeArtLevel(l.level, l.generated)),
    null,
    1,
  ) + "\n";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  writeFileSync(OUTPUT, serialize(artLevels()));
  console.log(`→ ${fileURLToPath(OUTPUT)} (${pieces.length} levels)`);
}
