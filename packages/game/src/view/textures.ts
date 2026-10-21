import Phaser from "phaser";

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
