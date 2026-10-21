import Phaser from "phaser";
import { hexToNumber, luminance, theme } from "../theme";
import { TEX } from "./textures";

/**
 * A wisp: a soft glow, a bright core in its color with a light rim (so dark colors still read on
 * the night background) and its remaining charge.
 */
export class WispView extends Phaser.GameObjects.Container {
  private readonly glow: Phaser.GameObjects.Image;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    readonly wispId: number,
    readonly colorHex: string,
    charge: number,
    private radius: number,
  ) {
    super(scene, 0, 0);
    const color = hexToNumber(colorHex);
    this.glow = scene.add.image(0, 0, TEX.glow).setTint(color).setAlpha(0.75);
    this.core = scene.add.circle(0, 0, radius, color);
    this.label = scene.add
      .text(0, 0, "", {
        fontFamily: theme.font,
        fontStyle: "bold",
        color: luminance(colorHex) > 0.45 ? "#1a0f33" : "#ffffff",
      })
      .setOrigin(0.5);
    this.add([this.glow, this.core, this.label]);
    this.setRadius(radius);
    this.setCharge(charge);
    scene.add.existing(this);
  }

  setCharge(charge: number): this {
    this.label.setText(String(charge));
    return this;
  }

  setRadius(radius: number): this {
    this.radius = radius;
    this.core.setRadius(radius);
    this.core.setStrokeStyle(Math.max(1, radius * 0.14), 0xffffff, 0.85);
    this.glow.setDisplaySize(radius * 4.2, radius * 4.2);
    this.label.setFontSize(Math.round(radius * (String(this.label.text).length > 1 ? 0.95 : 1.1)));
    return this;
  }

  get currentRadius(): number {
    return this.radius;
  }
}
