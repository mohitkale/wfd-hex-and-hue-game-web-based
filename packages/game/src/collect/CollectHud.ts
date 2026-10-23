import type Phaser from "phaser";
import { theme } from "../theme";
import { HUD_ZONE_CSS, hudButtonX, type CollectLayout } from "./collectLayout";
import { progressFill, progressTrack } from "./progress";

export interface HudHandlers {
  onUndo: () => void;
  onRestart: () => void;
  onSpeed: () => void;
}

/**
 * The top strip of the v2 board (M14.1): the level's name, undo, retry, the speed button and a thin
 * progress bar along its bottom edge. It only draws and reports taps; the scene decides what they do.
 * Everything is added to the scene, so the board's rebuild clears it.
 */
export class CollectHud {
  private readonly speedLabel: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Graphics;
  private shown = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: CollectLayout,
    name: string,
    speed: number,
    handlers: HudHandlers,
  ) {
    const l = layout;
    const dpr = l.dpr;
    const cy = l.hud.y + l.hud.h / 2;
    scene.add
      .text(l.frame.x + 14 * dpr, cy, name, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(16 * dpr)}px`,
        color: theme.text,
      })
      .setOrigin(0, 0.5)
      .setDepth(20);
    const zone = Math.round(HUD_ZONE_CSS * dpr);
    const buttons: [string, () => void][] = [
      ["↶", handlers.onUndo],
      ["⟲", handlers.onRestart],
      [`${speed}×`, handlers.onSpeed],
    ];
    let speedLabel: Phaser.GameObjects.Text | null = null;
    buttons.forEach(([label, onPress], i) => {
      const x = hudButtonX(l, i, buttons.length);
      const text = scene.add
        .text(x, cy, label, {
          fontFamily: theme.font,
          fontStyle: "bold",
          fontSize: `${Math.round(17 * dpr)}px`,
          color: theme.text,
        })
        .setOrigin(0.5)
        .setDepth(21);
      if (i === 2) speedLabel = text;
      // A 44 css px tap target around each 36 px button.
      const hit = scene.add
        .zone(x, cy, zone, zone)
        .setDepth(22)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", onPress);
    });
    this.speedLabel = speedLabel!;
    this.bar = scene.add.graphics().setDepth(20);
  }

  setSpeed(speed: number): void {
    this.speedLabel.setText(`${speed}×`);
  }

  /** Draws the progress bar for `fraction` (0..1); does nothing when it has not changed. */
  setProgress(fraction: number): void {
    const key = Math.round(fraction * 10_000);
    if (key === this.shown) return;
    this.shown = key;
    const track = progressTrack(this.layout);
    const g = this.bar;
    g.clear();
    g.fillStyle(theme.mist, 0.14);
    g.fillRoundedRect(track.x, track.y, track.w, track.h, track.h / 2);
    const fill = progressFill(track, fraction);
    if (fill.w > 0) {
      g.fillStyle(theme.glow, 0.95);
      g.fillRoundedRect(fill.x, fill.y, fill.w, fill.h, fill.h / 2);
    }
  }
}
