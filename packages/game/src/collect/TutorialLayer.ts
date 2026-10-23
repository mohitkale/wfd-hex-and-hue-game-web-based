import type Phaser from "phaser";
import { isReducedMotion } from "../a11y";
import { theme } from "../theme";
import { HUD_ZONE_CSS, hudButtonX, type CollectLayout } from "./collectLayout";
import type { Hint, Target } from "./tutorial";

/** The rectangle a hint points at, in device pixels, or null when it points at nothing on the board. */
export function targetRect(
  l: CollectLayout,
  target: Target,
): { x: number; y: number; w: number; h: number } | null {
  if (!target) return null;
  if (target.kind === "column") return l.columns[target.index] ?? null;
  if (target.kind === "slot") return l.slots[target.index] ?? null;
  const size = Math.round(HUD_ZONE_CSS * l.dpr);
  const x = hudButtonX(l, 0, 3);
  return { x: x - size / 2, y: l.hud.y + l.hud.h / 2 - size / 2, w: size, h: size };
}

/**
 * What the tutorial shows (M14.2): one short caption under the HUD, a softly pulsing ring around the
 * thing to tap, and a small "Skip". It draws only and takes no taps except Skip, so it can never stand
 * between the player and the game. With reduced motion the ring does not pulse.
 */
export class TutorialLayer {
  private readonly caption: Phaser.GameObjects.Text;
  private readonly ring: Phaser.GameObjects.Graphics;
  private ringTween: Phaser.Tweens.Tween | null = null;
  private shown = "";

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: CollectLayout,
    onSkip: () => void,
  ) {
    const l = layout;
    const dpr = l.dpr;
    const top = l.hud.y + l.hud.h + 4 * dpr;
    this.caption = scene.add
      .text(l.frame.x + l.frame.w / 2, top, "", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(15 * dpr)}px`,
        color: "#1a0f33",
        backgroundColor: "#f6d97a",
        padding: { x: 12 * dpr, y: 6 * dpr },
        align: "center",
        wordWrap: { width: l.frame.w * 0.7 },
      })
      .setOrigin(0.5, 0)
      .setDepth(30)
      .setVisible(false);
    this.ring = scene.add.graphics().setDepth(26);
    const skip = scene.add
      .text(l.frame.x + l.frame.w - 14 * dpr, top + 2 * dpr, "Skip ›", {
        fontFamily: theme.font,
        fontSize: `${Math.round(13 * dpr)}px`,
        color: theme.textDim,
      })
      .setOrigin(1, 0)
      .setDepth(30);
    // A 44 css px tap target around the small label.
    scene.add
      .zone(
        skip.x - skip.width / 2,
        skip.y + skip.height / 2,
        Math.max(skip.width + 20 * dpr, 44 * dpr),
        44 * dpr,
      )
      .setDepth(31)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onSkip);
  }

  /** Shows `hint` (or clears everything for null); redraws only when it changed. */
  show(hint: Hint | null): void {
    const key = hint ? `${hint.id}|${JSON.stringify(hint.target)}` : "";
    if (key === this.shown) return;
    this.shown = key;
    this.ringTween?.stop();
    this.ringTween = null;
    this.ring.clear().setAlpha(1);
    if (!hint) {
      this.caption.setVisible(false);
      return;
    }
    this.caption.setText(hint.text).setVisible(true);
    const r = targetRect(this.layout, hint.target);
    if (!r) return;
    const dpr = this.layout.dpr;
    const pad = 3 * dpr;
    this.ring.lineStyle(Math.max(2, Math.round(2.5 * dpr)), theme.glow, 1);
    this.ring.strokeRoundedRect(r.x - pad, r.y - pad, r.w + 2 * pad, r.h + 2 * pad, 14 * dpr);
    if (!isReducedMotion(this.scene)) {
      this.ringTween = this.scene.tweens.add({
        targets: this.ring,
        alpha: 0.35,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }
}
