import type Phaser from "phaser";
import { theme } from "../theme";
import type { CollectLayout } from "./collectLayout";

/**
 * The one-line message above the field strip ("Every tray is busy"). A new message replaces
 * the old one; it fades by itself and never takes a tap, so it cannot block anything. Wraps to the
 * board's width so long lines fit a 320 px phone.
 */
export class Toast {
  private text: Phaser.GameObjects.Text | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: CollectLayout,
  ) {}

  show(message: string, holdMs = 1200): void {
    this.text?.destroy();
    const l = this.layout;
    const dpr = l.dpr;
    const t = this.scene.add
      .text(l.frame.x + l.frame.w / 2, l.trays[0]!.y - 6 * dpr, message, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(13 * dpr)}px`,
        color: "#ffffff",
        backgroundColor: "#2a1650",
        padding: { x: 10 * dpr, y: 5 * dpr },
        align: "center",
        wordWrap: { width: l.frame.w * 0.9 },
      })
      .setOrigin(0.5, 1)
      .setDepth(40);
    this.text = t;
    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      delay: holdMs,
      duration: 300,
      onComplete: () => {
        if (this.text === t) this.text = null;
        t.destroy();
      },
    });
  }
}
