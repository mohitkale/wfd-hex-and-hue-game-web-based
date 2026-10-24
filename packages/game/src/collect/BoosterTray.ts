import type Phaser from "phaser";
import { theme } from "../theme";
import type { CollectLayout } from "./collectLayout";
import { PRICES, type Booster, type Pouch } from "./pouch";

export interface TrayHandlers {
  onSlot: () => void;
  onHint: () => void;
}

/** What a booster pill says: its stock, or its price when the stock is empty. */
export function pillLabel(name: string, pouch: Pouch, booster: Booster): string {
  const n = pouch.boosters[booster];
  return n > 0 ? `${name} ×${n}` : `${name} ${PRICES[booster]}✦`;
}

/** The small count shown on the HUD's Undo button: stock, or nothing when it would be bought. */
export const undoBadge = (pouch: Pouch): string =>
  pouch.boosters.undo > 0 ? String(pouch.boosters.undo) : "";

/**
 * The strip under the HUD (M14.4): the coin balance and the Extra Slot and Hint boosters. It draws
 * and reports taps; `boosterUse` decides what a tap does. Everything is added to the scene, so the
 * board's rebuild clears it.
 */
export class BoosterTray {
  private readonly coins: Phaser.GameObjects.Text;
  private readonly slot: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private readonly layout: CollectLayout,
    handlers: TrayHandlers,
  ) {
    const { tray, dpr } = layout;
    const cy = tray.y + tray.h / 2;
    const style = (color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: theme.font,
      fontStyle: "bold",
      fontSize: `${Math.round(13 * dpr)}px`,
      color,
    });
    this.coins = scene.add
      .text(tray.x + 2 * dpr, cy, "", style(theme.textDim))
      .setOrigin(0, 0.5)
      .setDepth(20);
    const pill = (right: number, onPress: () => void) => {
      const text = scene.add
        .text(right, cy, "", { ...style(theme.text), padding: { x: 10 * dpr, y: 6 * dpr } })
        .setOrigin(1, 0.5)
        .setDepth(21)
        .setBackgroundColor("#2a1c52");
      text.setInteractive({ useHandCursor: true });
      text.on("pointerdown", onPress);
      return text;
    };
    const right = tray.x + tray.w;
    this.hint = pill(right, handlers.onHint);
    // The Slot pill sits left of Hint; laid out after the first sync, when the widths are known.
    this.slot = pill(right, handlers.onSlot);
  }

  /** Updates the labels from the pouch; `slotsLeft` is false when the level has gained its maximum. */
  sync(pouch: Pouch, slotsLeft: boolean): void {
    this.coins.setText(`✦ ${pouch.coins}`);
    this.hint.setText(pillLabel("Hint", pouch, "hint"));
    this.slot.setText(slotsLeft ? pillLabel("+Slot", pouch, "extraSlot") : "+Slot max");
    this.slot.setAlpha(slotsLeft ? 1 : 0.5);
    this.slot.setX(this.hint.x - this.hint.width - 8 * this.layout.dpr);
  }
}
