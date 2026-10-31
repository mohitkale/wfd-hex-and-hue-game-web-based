/**
 * What the site's pages borrow from the game without loading Phaser: the familiar drawing (onto
 * any 2D canvas), the player's chosen species and the vibration patterns. Used by the Grimoire's
 * altar (apps/web/src/altar).
 */
import { drawFrame as paint, type Painter } from "./collect/familiarDraw";
import type { FrameName, Species } from "./collect/familiarArt";

export { FRAME_H, FRAME_W } from "./collect/familiarDraw";

/** Draws a familiar frame onto a page canvas (its context satisfies the game's `Painter`). */
export function drawFrame(
  g: CanvasRenderingContext2D,
  frame: FrameName,
  colorHex: string,
  species: Species,
): void {
  paint(g as unknown as Painter, frame, colorHex, species);
}
export { SPECIES, type Species } from "./collect/familiarArt";
export { readFamiliar } from "./collect/familiarChoice";
export { PATTERNS, type HapticKind } from "./haptics";
