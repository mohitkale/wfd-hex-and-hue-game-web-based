import Phaser from "phaser";
import { theme } from "../theme";
import { ensureTextures, TEX } from "../view/textures";

/** Title screen. Tap anywhere to open the level select. */
export class BootScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super("boot");
  }

  create(): void {
    ensureTextures(this);
    this.cameras.main.setBackgroundColor(theme.night);
    this.input.once("pointerup", () => this.scene.start("levels"));
    this.scale.on("resize", this.layout, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.layout, this));
    this.layout();
  }

  private layout(): void {
    for (const o of this.objects) o.destroy();
    const { width, height } = this.scale.gameSize;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const cx = width / 2;
    const halo = this.add
      .image(cx, height * 0.4, TEX.glow)
      .setTint(theme.glow)
      .setDisplaySize(160 * dpr, 160 * dpr);
    const wisp = this.add.circle(cx, height * 0.4, 22 * dpr, theme.glow);
    const title = this.add
      .text(cx, height * 0.56, "Hex & Hue", {
        fontFamily: theme.font,
        fontSize: `${Math.round(44 * dpr)}px`,
        color: theme.text,
      })
      .setOrigin(0.5);
    const tagline = this.add
      .text(cx, height * 0.56 + 44 * dpr, "A Little Magic in Every Color", {
        fontFamily: theme.font,
        fontSize: `${Math.round(18 * dpr)}px`,
        color: theme.textDim,
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(cx, height * 0.8, "Tap to begin", {
        fontFamily: theme.font,
        fontSize: `${Math.round(16 * dpr)}px`,
        color: theme.text,
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: halo, alpha: 0.4, duration: 1400, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });
    this.objects = [halo, wisp, title, tagline, hint];
  }
}
