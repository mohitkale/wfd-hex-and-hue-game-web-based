import type Phaser from "phaser";
import { theme } from "../theme";
import { bake } from "./bake";
import type { CollectLayout } from "./collectLayout";
import { PRICES, type Booster, type Pouch } from "./pouch";
import { TABLE } from "./tableLook";

export interface TrayHandlers {
  onSlot: () => void;
  onHint: () => void;
  onMenu: () => void;
  /** The power-ups (M15.13). */
  onCall: () => void;
  onSweep: () => void;
  onLantern: () => void;
}

/** The counted round buttons, left to right (Menu follows them). */
export const TRAY_BUTTONS = ["extraSlot", "call", "sweep", "lantern", "hint"] as const;
type Counted = (typeof TRAY_BUTTONS)[number];

const GLYPH: Record<Counted, string> = {
  extraSlot: "+",
  call: "🐾",
  sweep: "🧹",
  lantern: "🏮",
  hint: "?",
};

/** A tap target is at least this tall (css px), however small the button drawn in it. */
export const MIN_TAP_CSS = 44;

/** What a booster's badge says: its stock, or its price when the stock is empty. */
export function countLabel(pouch: Pouch, booster: Booster): string {
  const n = pouch.boosters[booster];
  return n > 0 ? String(n) : `${PRICES[booster]}✦`;
}

interface RoundButton {
  disc: Phaser.GameObjects.Image;
  glyph: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Image | null;
  count: Phaser.GameObjects.Text | null;
  /** The badge's diameter, for fitting a price ("25✦") into it. */
  badgeSize: number;
}

/**
 * The strip under the HUD (M14.4; round shortcuts since M15.13, like the reference's power-up row):
 * the coin balance on the left and, on the right, round buttons for Extra Tray, the three power-ups
 * (Familiar's Call, Besom Sweep, Crystal Lantern) and Hint with their stock (or price) on a badge,
 * then the menu. It draws and reports taps; `boosterUse` decides what a
 * tap does. The discs are baked textures (no per-frame vector drawing); everything is added to the
 * scene, so the board's rebuild clears it.
 */
export class BoosterTray {
  private readonly coins: Phaser.GameObjects.Text;
  private readonly buttons = new Map<Counted, RoundButton>();
  /** The ring around the power-up waiting for its target (Call, Sweep). */
  private readonly ring: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: CollectLayout,
    handlers: TrayHandlers,
  ) {
    const { tray, dpr } = layout;
    const cy = tray.y + tray.h / 2;
    this.coins = scene.add
      .text(tray.x + 2 * dpr, cy, "", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(15 * dpr)}px`,
        color: TABLE.ink,
      })
      .setOrigin(0, 0.5)
      .setDepth(20);
    // Six buttons right of the coins, sized to fit the narrowest phone.
    const count = TRAY_BUTTONS.length + 1;
    const step = Math.min(48 * dpr, (tray.w - 58 * dpr) / count);
    // Never below 12 css px: while a window is resized (or loads hidden) the canvas can briefly be a
    // few px wide, and a negative size would throw while baking the discs and stop the scene.
    const d = Math.max(
      Math.round(12 * dpr),
      Math.round(Math.min(tray.h - 2 * dpr, 34 * dpr, step - 6 * dpr)),
    );
    const right = tray.x + tray.w - d / 2;
    this.button(right, cy, d, "≡", handlers.onMenu, false);
    const press: Record<Counted, () => void> = {
      extraSlot: handlers.onSlot,
      call: handlers.onCall,
      sweep: handlers.onSweep,
      lantern: handlers.onLantern,
      hint: handlers.onHint,
    };
    TRAY_BUTTONS.forEach((b, i) => {
      const x = right - (count - 1 - i) * step;
      this.buttons.set(b, this.button(x, cy, d, GLYPH[b], press[b], true));
    });
    const ringKey = bake(scene, `arm-ring:${d}`, d + 8 * dpr, d + 8 * dpr, (g) => {
      g.lineStyle(Math.max(2, 3 * dpr), 0xf39a1e, 1);
      g.strokeCircle(d / 2 + 4 * dpr, d / 2 + 4 * dpr, d / 2 + 2 * dpr);
    });
    this.ring = scene.add.image(0, cy, ringKey).setDepth(21).setVisible(false);
  }

  /** Rings the power-up that is waiting for the player to pick its target, or none. */
  setArmed(b: "call" | "sweep" | null): void {
    const btn = b ? this.buttons.get(b) : undefined;
    this.ring.setVisible(btn !== undefined);
    if (btn) this.ring.setX(btn.disc.x);
  }

  private button(
    x: number,
    y: number,
    d: number,
    label: string,
    onPress: () => void,
    counted: boolean,
  ): RoundButton {
    const { scene } = this;
    const dpr = this.layout.dpr;
    const edge = Math.max(2, Math.round(2 * dpr));
    const discKey = bake(scene, `round:${d}:${edge}`, d, d + edge, (g) => {
      g.fillStyle(TABLE.buttonEdge, 1);
      g.fillCircle(d / 2, d / 2 + edge, d / 2);
      g.fillStyle(TABLE.button, 1);
      g.fillCircle(d / 2, d / 2, d / 2);
    });
    const disc = scene.add.image(x, y, discKey).setDepth(20);
    const glyph = scene.add
      .text(x, y - edge / 2, label, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(d * (label.length > 1 ? 0.5 : 0.58))}px`,
        color: TABLE.ink,
      })
      .setOrigin(0.5)
      .setDepth(21);
    let badge: Phaser.GameObjects.Image | null = null;
    let count: Phaser.GameObjects.Text | null = null;
    if (counted) {
      const b = Math.round(d * 0.52);
      const badgeKey = bake(scene, `badge-dot:${b}`, b, b, (g) => {
        g.fillStyle(0xffffff, 1);
        g.fillCircle(b / 2, b / 2, b / 2);
        g.fillStyle(0xf39a1e, 1);
        g.fillCircle(b / 2, b / 2, b / 2 - Math.max(1, dpr));
      });
      const bx = x + d * 0.38;
      const by = y + d * 0.34;
      badge = scene.add.image(bx, by, badgeKey).setDepth(22);
      count = scene.add
        .text(bx, by, "", {
          fontFamily: theme.font,
          fontStyle: "bold",
          fontSize: `${Math.round(b * 0.5)}px`,
          color: "#ffffff",
        })
        .setOrigin(0.5)
        .setDepth(23);
    }
    // A proper tap target around the drawn disc (at least 44 css px).
    const hit = Math.max(d, MIN_TAP_CSS * dpr);
    scene.add
      .zone(x, y, hit, hit)
      .setDepth(24)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onPress);
    return { disc, glyph, badge, count, badgeSize: Math.round(d * 0.52) };
  }

  /** Updates the counts from the pouch; `slotsLeft` is false when the level has gained its maximum. */
  sync(pouch: Pouch, slotsLeft: boolean): void {
    this.coins.setText(`✦ ${pouch.coins}`);
    for (const [b, btn] of this.buttons)
      this.setCount(btn, countLabel(pouch, b), b !== "extraSlot" || slotsLeft);
  }

  private setCount(b: RoundButton, text: string, enabled: boolean): void {
    // Text re-rasterises on every change: only touch it when the label really changed.
    if (b.count && b.count.text !== text) {
      // A stock count is one digit; a price ("25✦") needs a smaller font to stay inside the badge.
      b.count.setFontSize(`${Math.round(b.badgeSize * (text.length > 2 ? 0.32 : 0.5))}px`);
      b.count.setText(text);
    }
    const alpha = enabled ? 1 : 0.45;
    for (const o of [b.disc, b.glyph, b.badge, b.count]) o?.setAlpha(alpha);
  }
}
