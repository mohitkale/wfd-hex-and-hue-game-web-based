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
import { pieceToArt, type ArtPiece } from "./piece";

export const OUTPUT = new URL(
  "../../packages/game/src/collect/generated/art-levels.json",
  import.meta.url,
);

/** The profile order tried for a piece, and the seed: the first profile the picture can support wins. */
export const PROFILE_ORDER: collect.Profile[] = ["standard", "gentle"];
export const SEED = 1;

export interface ArtLevel {
  level: collect.CollectLevel;
  generated: ArtGenerated;
}

/** Generates a piece's level with the solver-verified generator (M12.2), adding its shades and subject. */
export function levelForPiece(piece: ArtPiece): ArtLevel {
  const { art, shades } = pieceToArt(piece);
  for (const profile of PROFILE_ORDER) {
    const g = collect.generateLevel(art, `art-${piece.id}`, piece.name, { seed: SEED, profile });
    if (!g) continue;
    return {
      level: {
        ...g.level,
        shades,
        subject: { id: piece.id, name: piece.name, theme: piece.theme, lore: piece.lore },
      },
      generated: { profile, seed: SEED, attempt: g.attempt, score: g.score, metrics: g.metrics },
    };
  }
  throw new Error(`${piece.id}: the generator found no solvable level for any profile`);
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
