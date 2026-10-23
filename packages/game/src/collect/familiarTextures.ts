import Phaser from "phaser";
import { FRAME_NAMES } from "./familiarArt";
import { atlasFrameName, atlasKey, atlasLayout, atlasRgba } from "./familiarAtlas";

const PREFIX = "familiars:";

/**
 * Builds the single packed familiar atlas for a level's colours (one texture, one draw batch,
 * 128 × 14·n pixels for n ≤ 16 colours) and registers every frame as `"<colourIndex>:<frame>"`
 * with nearest-neighbour filtering. Atlases of other colour sets are removed, so a level change
 * never leaves stale textures behind. Safe to call repeatedly. Returns the texture key.
 */
export function ensureFamiliarAtlas(scene: Phaser.Scene, colorsHex: readonly string[]): string {
  const key = atlasKey(colorsHex);
  for (const existing of scene.textures.getTextureKeys()) {
    if (existing.startsWith(PREFIX) && existing !== key) scene.textures.remove(existing);
  }
  if (scene.textures.exists(key)) return key;
  const layout = atlasLayout(colorsHex.length);
  const tex = scene.textures.createCanvas(key, layout.width, layout.height);
  if (!tex) throw new Error("could not create the familiar atlas texture");
  const { data } = atlasRgba(colorsHex);
  const ctx = tex.getContext();
  const img = ctx.createImageData(layout.width, layout.height);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  colorsHex.forEach((_, c) => {
    for (const name of FRAME_NAMES) {
      const r = layout.frame(c, name);
      tex.add(atlasFrameName(c, name), 0, r.x, r.y, r.w, r.h);
    }
  });
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}
