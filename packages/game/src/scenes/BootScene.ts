import Phaser from "phaser";
import { theme } from "../theme";

/** Placeholder title scene: proves rendering, resize and touch input on every device. */
export class BootScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private tagline!: Phaser.GameObjects.Text;
  private wisp!: Phaser.GameObjects.Arc;
  private halo!: Phaser.GameObjects.Arc;

  constructor() {
    super("boot");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(theme.night);

    this.halo = this.add.circle(0, 0, 46, theme.glow, 0.18);
    this.wisp = this.add.circle(0, 0, 22, theme.glow);
    this.title = this.add
      .text(0, 0, "Hex & Hue", { fontFamily: theme.font, fontSize: "44px", color: theme.text })
      .setOrigin(0.5);
    this.tagline = this.add
      .text(0, 0, "A Little Magic in Every Color", {
        fontFamily: theme.font,
        fontSize: "18px",
        color: "#c9b8ff",
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: this.halo,
      scale: 1.35,
      alpha: 0.05,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.tweens.killTweensOf(this.wisp);
      this.tweens.add({
        targets: this.wisp,
        x: p.x,
        y: p.y,
        duration: 220,
        onUpdate: () => this.halo.setPosition(this.wisp.x, this.wisp.y),
      });
      navigator.vibrate?.(8);
    });

    this.scale.on("resize", this.layout, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.layout, this));
    this.layout();
  }

  private layout(): void {
    const { width, height } = this.scale.gameSize;
    const cx = width / 2;
    this.wisp.setPosition(cx, height * 0.42);
    this.halo.setPosition(cx, height * 0.42);
    this.title.setPosition(cx, height * 0.58);
    this.tagline.setPosition(cx, height * 0.58 + 44);
  }
}
