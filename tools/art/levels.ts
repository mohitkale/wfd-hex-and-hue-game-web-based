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
import type { Tier } from "../../content/difficulty";
import { generateForTier } from "../collect/tierGate";
import { pieceToArt, type ArtPiece } from "./piece";

export const OUTPUT = new URL(
  "../../packages/game/src/collect/generated/art-levels.json",
  import.meta.url,
);

/**
 * The tier each piece is generated for, and the seed. The generator only returns a level whose
 * simulated players behave as the tier's band demands (M12.3, `tools/collect/tierGate.ts`): the
 * moons, the cauldron, the crystals and the scales can only support the tutorial band (cheap play
 * beats them however they are dealt: see docs/V2_STRATEGIES.md); the black cat reaches easy.
 */
export const TARGET_TIER: Record<string, Tier> = { "black-cat": "easy" };
export const DEFAULT_TIER: Tier = "tutorial";
export const SEED = 1;

export interface ArtLevel {
  level: collect.CollectLevel;
  generated: ArtGenerated;
}

/** Generates a piece's level (M12.2) for its tier (M12.3), adding its shades and subject. */
export function levelForPiece(piece: ArtPiece): ArtLevel {
  const { art, shades } = pieceToArt(piece);
  const tier = TARGET_TIER[piece.id] ?? DEFAULT_TIER;
  const g = generateForTier(art, `art-${piece.id}`, piece.name, tier, SEED);
  if (!g) throw new Error(`${piece.id}: no level meets the ${tier} band`);
  const report = collect.strategyReport(g.level);
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
    },
  };
}

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
