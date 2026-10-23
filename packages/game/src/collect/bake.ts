import type Phaser from "phaser";

/**
 * Bakes static drawing into a texture once. A Graphics object replays (and re-tessellates, for
 * rounded rectangles and ellipses) all of its commands on every frame it is visible; a baked image
 * is one textured quad. Returns the texture key (a no-op if the key already exists).
 */
export function bake(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  draw(g);
  g.generateTexture(key, Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  g.destroy();
  return key;
}
