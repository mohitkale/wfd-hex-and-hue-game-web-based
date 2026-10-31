import Phaser from "phaser";
import { isReducedMotion } from "../a11y";
import { getAudio } from "../audio";
import { theme } from "../theme";

export interface ButtonOptions {
  /** Device pixel ratio, for sizing. */
  dpr: number;
  primary?: boolean;
  onPress: () => void;
}

/**
 * A pill button with immediate press feedback. Fires on release over the button, so a thumb can
 * slide off to cancel, like native buttons.
 */
export class Button extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    label: string,
    options: ButtonOptions,
  ) {
    super(scene, x, y);
    const { dpr, primary = false } = options;
    const height = Math.round(48 * dpr);
    const bg = scene.add.graphics();
    bg.fillStyle(primary ? theme.glow : theme.dusk, 1);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    if (!primary) {
      bg.lineStyle(Math.max(1, dpr * 1.5), theme.mist, 0.6);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    }
    const text = scene.add
      .text(0, 0, label, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(17 * dpr)}px`,
        color: primary ? "#1a0f33" : theme.text,
      })
      .setOrigin(0.5);
    // A long label on a narrow pill (three to a shelf on a 320 px phone) shrinks to fit.
    const room = width - 2 * 12 * dpr;
    if (text.width > room) text.setScale(room / text.width);
    this.add([bg, text]);
    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true });
    let pressed = false;
    const release = () => {
      pressed = false;
      if (isReducedMotion(scene)) this.setScale(1);
      else scene.tweens.add({ targets: this, scale: 1, duration: 120, ease: "Back.easeOut" });
    };
    this.on("pointerdown", () => {
      pressed = true;
      scene.tweens.killTweensOf(this);
      this.setScale(0.94);
    });
    this.on("pointerout", () => pressed && release());
    this.on("pointerup", () => {
      if (!pressed) return;
      release();
      getAudio(scene).play("ui");
      options.onPress();
    });
    scene.add.existing(this);
  }
}
