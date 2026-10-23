import Phaser from "phaser";
import { FAMILIAR_H, FAMILIAR_W, FRAME_NAMES, frameRgba, type FrameName } from "./familiarArt";

/** Texture key for the familiar sheet of one cube colour. */
export const familiarKey = (colorHex: string): string => `familiar-${colorHex.toLowerCase()}`;

/**
 * Builds one small canvas texture per cube colour (all frames side by side) and registers each
 * frame by name, with nearest-neighbour filtering so the pixels stay crisp when scaled by a whole
 * number. Cheap: 16 colours × 8 frames of 16×14 pixels. Safe to call repeatedly.
 */
export function ensureFamiliarTextures(scene: Phaser.Scene, colorsHex: readonly string[]): void {
  for (const color of colorsHex) {
    const key = familiarKey(color);
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, FAMILIAR_W * FRAME_NAMES.length, FAMILIAR_H);
    if (!tex) continue;
    const ctx = tex.getContext();
    FRAME_NAMES.forEach((name, i) => {
      const img = ctx.createImageData(FAMILIAR_W, FAMILIAR_H);
      img.data.set(frameRgba(name, color));
      ctx.putImageData(img, i * FAMILIAR_W, 0);
      tex.add(name, 0, i * FAMILIAR_W, 0, FAMILIAR_W, FAMILIAR_H);
    });
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

export type { FrameName };
