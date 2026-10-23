import type * as collect from "@hexhue/core/collect";
import { decodeArtLevel, type ArtLevelData } from "./artLevelCodec";
import data from "./generated/art-levels.json";

/** Playable levels by id (`art-<piece id>`). */
export const ART_LEVELS: Record<string, () => collect.CollectLevel> = Object.fromEntries(
  (data as ArtLevelData[]).map((d) => [d.id, () => decodeArtLevel(d)]),
);

/** The finished picture of a piece by its id, for the Spellbook (null when unknown). */
export function artLevelForPiece(pieceId: string): collect.CollectLevel | null {
  return ART_LEVELS[`art-${pieceId}`]?.() ?? null;
}

export const ART_PIECE_IDS: string[] = (data as ArtLevelData[]).map((d) => d.subject.id);
