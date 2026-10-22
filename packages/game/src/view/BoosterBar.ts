import Phaser from "phaser";
import { PRICES, paymentFor } from "../economy";
import type { Rect } from "../layout";
import type { BoosterKind, SaveData } from "../save/schema";
import { theme } from "../theme";

const BUTTONS: { kind: BoosterKind; glyph: string; label: string }[] = [
  { kind: "undo", glyph: "↶", label: "Undo" },
  { kind: "shuffle", glyph: "⇄", label: "Shuffle" },
  { kind: "extraSlot", glyph: "+", label: "Slot" },
  { kind: "wand", glyph: "✦", label: "Wand" },
];

/**
 * The booster row: four round buttons (each showing how many you own, or its coin price) and the
 * coin counter. Buttons fire on release over them, like native buttons.
 */
export class BoosterBar {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly badges = new Map<BoosterKind, Phaser.GameObjects.Text>();
  private readonly discs = new Map<BoosterKind, Phaser.GameObjects.Arc>();
  private readonly coins: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    rect: Rect,
    private readonly dpr: number,
    depth: number,
    onPress: (kind: BoosterKind) => void,
  ) {
    const r = Math.min(rect.h * 0.36, 20 * dpr);
    const slotW = rect.w / (BUTTONS.length + 1.4);
    const cy = rect.y + rect.h * 0.42;
    BUTTONS.forEach((b, i) => {
      const cx = rect.x + slotW * (i + 0.5);
      // The visible disc can be small on compact layouts; the touch target is always ≥ 48 px.
      const hit = Math.max(r, 24 * dpr);
      const disc = scene.add
        .circle(cx, cy, r, theme.dusk)
        .setStrokeStyle(Math.max(1, 1.5 * dpr), theme.mist, 0.6)
        .setInteractive({
          hitArea: new Phaser.Geom.Circle(r, r, hit),
          hitAreaCallback: Phaser.Geom.Circle.Contains,
          useHandCursor: true,
        });
      const glyph = scene.add
        .text(cx, cy, b.glyph, {
          fontFamily: theme.font,
          fontStyle: "bold",
          fontSize: `${Math.round(r * 1.05)}px`,
          color: theme.text,
        })
        .setOrigin(0.5);
      const label = scene.add
        .text(cx, cy + r + 2 * dpr, b.label, {
          fontFamily: theme.font,
          fontSize: `${Math.round(10 * dpr)}px`,
          color: theme.textDim,
        })
        .setOrigin(0.5, 0);
      const badge = scene.add
        .text(cx + r * 0.8, cy - r * 0.8, "", {
          fontFamily: theme.font,
          fontStyle: "bold",
          fontSize: `${Math.round(10 * dpr)}px`,
          color: "#1a0f33",
          backgroundColor: "#f6d97a",
          padding: { x: Math.round(4 * dpr), y: Math.round(1 * dpr) },
        })
        .setOrigin(0.5);
      let pressed = false;
      disc.on("pointerdown", () => {
        pressed = true;
        disc.setScale(0.9);
        glyph.setScale(0.9);
      });
      const release = () => {
        disc.setScale(1);
        glyph.setScale(1);
      };
      disc.on("pointerout", () => {
        pressed = false;
        release();
      });
      disc.on("pointerup", () => {
        release();
        if (pressed) onPress(b.kind);
        pressed = false;
      });
      this.badges.set(b.kind, badge);
      this.discs.set(b.kind, disc);
      this.objects.push(disc, glyph, label, badge);
    });
    this.coins = scene.add
      .text(rect.x + rect.w, cy, "", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(15 * dpr)}px`,
        color: "#f6d97a",
        backgroundColor: "#2a1650",
        padding: { x: Math.round(10 * dpr), y: Math.round(5 * dpr) },
      })
      .setOrigin(1, 0.5);
    this.objects.push(this.coins);
    for (const o of this.objects)
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(depth);
  }

  /** Refreshes counts / prices and the coin total. */
  update(save: Pick<SaveData, "boosters" | "coins">): void {
    for (const { kind } of BUTTONS) {
      const p = paymentFor(save, kind);
      this.badges
        .get(kind)!
        .setText(p.kind === "owned" ? String(save.boosters[kind]) : `◉${PRICES[kind]}`)
        .setBackgroundColor(p.kind === "short" ? "#6d6292" : "#f6d97a");
    }
    this.coins.setText(`◉ ${save.coins}`);
  }

  /** Pulses the coin counter (after earning or spending). */
  pulseCoins(): void {
    this.scene.tweens.add({ targets: this.coins, scale: 1.2, duration: 120, yoyo: true });
  }

  /** Screen position of a booster button (for effects that fly from it). */
  position(kind: BoosterKind): { x: number; y: number } {
    const d = this.discs.get(kind)!;
    return { x: d.x, y: d.y };
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
  }
}
