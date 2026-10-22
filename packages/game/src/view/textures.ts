import Phaser from "phaser";
import { paintSymbol } from "../a11y";

export const TEX = { glow: "glow", spark: "spark" } as const;

/** Procedural textures shared by all scenes; created once per game. */
export function ensureTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TEX.glow)) {
    const size = 128;
    const tex = scene.textures.createCanvas(TEX.glow, size, size)!;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }
  if (!scene.textures.exists(TEX.spark)) {
    const size = 16;
    const tex = scene.textures.createCanvas(TEX.spark, size, size)!;
    const ctx = tex.getContext();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(2, 2, size - 4, size - 4);
    tex.refresh();
  }
}

/** A white colorblind symbol (see a11y.ts) for palette color `index`, drawn once per game. */
export function symbolTexture(scene: Phaser.Scene, index: number): string {
  const key = `symbol-${index}`;
  if (!scene.textures.exists(key)) {
    const size = 64;
    const tex = scene.textures.createCanvas(key, size, size)!;
    const ctx = tex.getContext();
    ctx.fillStyle = "#ffffff";
    paintSymbol(ctx, index, size / 2, size / 2, size * 0.9);
    tex.refresh();
  }
  return key;
}
