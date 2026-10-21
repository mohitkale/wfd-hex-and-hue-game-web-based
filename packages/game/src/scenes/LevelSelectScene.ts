import Phaser from "phaser";
import { worlds } from "../levels";
import { theme } from "../theme";
import { ensureTextures, TEX } from "../view/textures";
import type { PlayData } from "./PlayScene";

/**
 * Level select (stub until the world map in M5.2): every level of every world as a tappable tile.
 * All levels are open; progress and stars arrive with saving in M5.1.
 */
export class LevelSelectScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super("levels");
  }

  create(): void {
    this.objects = [];
    ensureTextures(this);
    this.cameras.main.setBackgroundColor(theme.night);
    this.scale.on("resize", this.layout, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.layout, this));
    this.layout();
  }

  private layout(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    const { width } = this.scale.gameSize;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const insets = (this.registry.get("insets") as { top: number } | undefined) ?? { top: 0 };
    const px = (v: number) => Math.round(v * dpr);
    const frameW = Math.min(width, px(480));
    const left = (width - frameW) / 2;
    let y = insets.top + px(36);

    this.objects.push(
      this.add
        .text(width / 2, y, "Hex & Hue", {
          fontFamily: theme.font,
          fontStyle: "bold",
          fontSize: `${px(30)}px`,
          color: theme.text,
        })
        .setOrigin(0.5, 0),
    );
    y += px(64);

    const cols = 4;
    const tile = Math.floor((frameW - px(32) - (cols - 1) * px(14)) / cols);
    worlds.forEach((world, w) => {
      this.objects.push(
        this.add
          .text(left + px(16), y, world.name, {
            fontFamily: theme.font,
            fontStyle: "bold",
            fontSize: `${px(17)}px`,
            color: theme.textDim,
          })
          .setOrigin(0, 0),
      );
      y += px(34);
      world.levels.forEach((built, i) => {
        const cx = left + px(16) + (i % cols) * (tile + px(14)) + tile / 2;
        const cy = y + Math.floor(i / cols) * (tile + px(30)) + tile / 2;
        this.objects.push(
          ...this.levelTile(cx, cy, tile, i + 1, built.level.name, { world: w, level: i }),
        );
      });
      y += Math.ceil(world.levels.length / cols) * (tile + px(30)) + px(16);
    });
  }

  private levelTile(
    cx: number,
    cy: number,
    size: number,
    number: number,
    name: string,
    data: PlayData,
  ): Phaser.GameObjects.GameObject[] {
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const halo = this.add.image(cx, cy, TEX.glow).setTint(theme.mist).setAlpha(0.35);
    halo.setDisplaySize(size * 1.5, size * 1.5);
    const disc = this.add
      .circle(cx, cy, size * 0.4, theme.dusk)
      .setStrokeStyle(Math.max(1, 2 * dpr), theme.glow, 0.9)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(cx, cy, String(number), {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(size * 0.32)}px`,
        color: theme.text,
      })
      .setOrigin(0.5);
    const caption = this.add
      .text(cx, cy + size * 0.5, name, {
        fontFamily: theme.font,
        fontSize: `${Math.round(11 * dpr)}px`,
        color: theme.textDim,
        align: "center",
        wordWrap: { width: size * 1.1 },
      })
      .setOrigin(0.5, 0);
    disc.on("pointerdown", () => {
      this.tweens.add({ targets: [disc, label], scale: 0.9, duration: 80, yoyo: true });
      navigator.vibrate?.(8);
    });
    disc.on("pointerup", () => this.scene.start("play", data));
    return [halo, disc, label, caption];
  }
}
