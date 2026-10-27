import Phaser from "phaser";
import { FRAME_NAMES, type Species } from "./familiarArt";
import { drawFrame, type Painter } from "./familiarDraw";
import { atlasFrameName, atlasKey, atlasLayout } from "./familiarAtlas";

const PREFIX = "familiars:";

/**
 * Builds the single packed familiar atlas for a level's colours and species (one texture, one draw
 * batch, 512 x 56n pixels for n <= 16 colours): every frame is drawn as smooth vector art (bats or
 * cats, `familiarDraw.ts`) and registered as `"<colourIndex>:<frame>"` with linear filtering.
 * Atlases of other colour sets are removed, so a level change never leaves stale textures behind.
 * Safe to call repeatedly. Returns the texture key.
 */
export function ensureFamiliarAtlas(
  scene: Phaser.Scene,
  colorsHex: readonly string[],
  species: Species = "bat",
): string {
  const key = atlasKey(colorsHex, species);
  for (const existing of scene.textures.getTextureKeys()) {
    if (existing.startsWith(PREFIX) && existing !== key) scene.textures.remove(existing);
  }
  if (scene.textures.exists(key)) return key;
  const layout = atlasLayout(colorsHex.length);
  const tex = scene.textures.createCanvas(key, layout.width, layout.height);
  if (!tex) throw new Error("could not create the familiar atlas texture");
  const ctx = tex.getContext();
  colorsHex.forEach((hex, c) => {
    for (const name of FRAME_NAMES) {
      const r = layout.frame(c, name);
      ctx.save();
      ctx.translate(r.x, r.y);
      // Keep every frame's drawing inside its own cell.
      ctx.beginPath();
      ctx.rect(0, 0, r.w, r.h);
      ctx.clip();
      drawFrame(ctx as unknown as Painter, name, hex, species);
      ctx.restore();
      tex.add(atlasFrameName(c, name), 0, r.x, r.y, r.w, r.h);
    }
  });
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}
