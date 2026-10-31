import type * as collect from "@hexhue/core/collect";
import { decodeArtLevel, type ArtLevelData } from "./artLevelCodec";
import { toPictureBoard } from "./pictureBoard";
import data from "./generated/art-levels.json";

/** Playable levels by id (`art-<piece id>`). */
export const ART_LEVELS: Record<string, () => collect.CollectLevel> = Object.fromEntries(
  (data as ArtLevelData[]).map((d) => [d.id, () => decodeArtLevel(d)]),
);

/**
 * The finished picture of a piece by its id, for the Spellbook (null when unknown): as the board plays
 * it (M15.13), in the picture-board colours.
 */
export function artLevelForPiece(pieceId: string): collect.CollectLevel | null {
  const make = ART_LEVELS[`art-${pieceId}`];
  return make ? toPictureBoard(make()) : null;
}

export const ART_PIECE_IDS: string[] = (data as ArtLevelData[]).map((d) => d.subject.id);
