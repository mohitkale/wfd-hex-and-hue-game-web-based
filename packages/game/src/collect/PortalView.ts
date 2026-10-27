import type Phaser from "phaser";
import { isReducedMotion } from "../a11y";
import { TEX } from "../view/textures";
import { bake } from "./bake";
import type { CollectLayout } from "./collectLayout";

/**
 * The portal (a glowing gate in the dock under the picture): a baked gate image under a softly pulsing glow that
 * gives a small bump when a cube lands. Decorative only; with reduced motion it stays still.
 */
export class PortalView {
  private readonly glow: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: CollectLayout,
  ) {
    const l = layout;
    const dpr = l.dpr;
    const p = l.portal;
    this.glow = scene.add
      .image(p.x, p.y, TEX.glow)
      .setTint(0xb48cff)
      .setDepth(0.5)
      .setDisplaySize(l.cell * 3.2, l.cell * 3.2)
      .setAlpha(0.8);
    const gw = Math.round(l.cell * 1.6) + 4;
    const gh = Math.round(l.cell * 1.15) + 4;
    const key = bake(scene, `gate:${gw}x${gh}:${dpr}`, gw, gh, (g) => {
      g.fillStyle(0x140b2e, 1);
      g.fillEllipse(gw / 2, gh / 2, l.cell * 1.6, l.cell * 1.15);
      g.lineStyle(Math.max(1, Math.round(dpr * 1.5)), 0xf6d97a, 0.95);
      g.strokeEllipse(gw / 2, gh / 2, l.cell * 1.6, l.cell * 1.15);
    });
    scene.add.image(p.x, p.y, key).setDepth(3);
    if (!isReducedMotion(scene)) {
      scene.tweens.add({
        targets: this.glow,
        alpha: 0.45,
        duration: 1300,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  /** A quick swell of the glow for a delivery. */
  pulse(): void {
    if (isReducedMotion(this.scene)) return;
    const base = this.layout.cell * 3.2;
    this.scene.tweens.add({
      targets: this.glow,
      displayWidth: base * 1.3,
      displayHeight: base * 1.3,
      duration: 90,
      yoyo: true,
      ease: "Sine.easeOut",
    });
  }
}
