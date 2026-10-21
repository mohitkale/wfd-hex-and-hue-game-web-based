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
  private readonly ring: Phaser.GameObjects.Arc;

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
    // Pulsing ring shown while the wisp waits to launch (tapped while the entry was busy).
    this.ring = scene.add.circle(0, 0, radius).setFillStyle().setVisible(false);
    this.add([this.glow, this.ring, this.core, this.label]);
    this.radius = -1;
    this.setRadius(radius);
    this.setCharge(charge);
    scene.add.existing(this);
  }

  setCharge(charge: number): this {
    this.label.setText(String(charge));
    // A spent wisp (on its way to the portal) shows no number.
    this.label.setVisible(charge > 0);
    return this;
  }

  setRadius(radius: number): this {
    // Rebuilding the arc and glow is not free; settled wisps call this every frame.
    if (Math.abs(radius - this.radius) < 0.01) return this;
    this.radius = radius;
    this.core.setRadius(radius);
    this.core.setStrokeStyle(Math.max(1, radius * 0.14), 0xffffff, 0.85);
    this.glow.setDisplaySize(radius * 4.2, radius * 4.2);
    this.ring.setRadius(radius * 1.32);
    this.ring.setStrokeStyle(Math.max(1.5, radius * 0.16), 0xf6d97a, 1);
    this.label.setFontSize(Math.round(radius * (String(this.label.text).length > 1 ? 0.95 : 1.1)));
    return this;
  }

  /** Shows or hides the queued ring. */
  setQueued(queued: boolean): this {
    if (queued !== this.ring.visible) this.ring.setVisible(queued);
    return this;
  }

  /** Animates the queued ring; `pulse` is 0..1. */
  pulseRing(pulse: number): this {
    this.ring.setAlpha(0.45 + 0.55 * pulse).setScale(1 + 0.08 * pulse);
    return this;
  }

  /**
   * "Nope" shake: a damped, symmetric side-to-side wobble of the wisp's body. It moves the
   * children, not the container, so the wisp's real position (used for launch flights) is untouched.
   */
  shake(amplitude: number): void {
    const parts = [this.glow, this.ring, this.core, this.label];
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 280,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 1;
        const dx = amplitude * Math.sin(t * Math.PI * 5) * (1 - t);
        for (const p of parts) p.x = dx;
      },
      onComplete: () => {
        for (const p of parts) p.x = 0;
      },
    });
  }

  get currentRadius(): number {
    return this.radius;
  }
}
