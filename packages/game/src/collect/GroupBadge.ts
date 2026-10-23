import Phaser from "phaser";
import { isReducedMotion } from "../a11y";
import { hexToNumber, inkFor, theme } from "../theme";
import { symbolTexture } from "../view/textures";
import { bake } from "./bake";
import { tonesFor } from "./cubePaint";

export interface BadgeOptions {
  w: number;
  h: number;
  colorHex: string;
  colorIndex: number;
  atlas: string;
  number: number;
  dpr: number;
  /** "mini" drops the creature and keeps just the number (queued groups behind the front one). */
  mini?: boolean;
  /** Colour-blind mode: draw the colour's symbol in the corner. */
  symbol?: boolean;
}

/**
 * A summon group: a creature of the group's colour with the number of cubes it can still deliver.
 * The number is real remaining capacity (it changes only when a cube is delivered).
 */
export class GroupBadge extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private shown: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly opts: BadgeOptions,
  ) {
    super(scene, x, y);
    const { w, h, dpr } = opts;
    const tones = tonesFor(opts.colorHex);
    const radius = Math.min(w, h) * 0.22;
    const lw = Math.max(1, dpr * 1.5);
    const key = `badge:${opts.colorHex}:${Math.round(w)}x${Math.round(h)}:${lw}`;
    bake(scene, key, w, h, (g) => {
      g.fillStyle(tones.dark, 0.95);
      g.fillRoundedRect(lw / 2, lw / 2, w - lw, h - lw, radius);
      g.fillStyle(tones.base, 0.35);
      g.fillRoundedRect(lw / 2, lw / 2, w - lw, (h - lw) * 0.55, radius);
      g.lineStyle(lw, tones.light, 0.9);
      g.strokeRoundedRect(lw / 2, lw / 2, w - lw, h - lw, radius);
    });
    const bg = scene.add.image(0, 0, key).setOrigin(0.5);
    this.add(bg);

    const horizontal = w >= h * 1.25;
    const fontPx = Math.round(
      opts.mini ? Math.min(h * 0.62, w * 0.7) : Math.min(h * 0.36, w * 0.34),
    );
    if (!opts.mini) {
      const scale = Math.max(
        1,
        Math.floor(Math.min((h * 0.62) / 14, (w * (horizontal ? 0.4 : 0.7)) / 16)),
      );
      const icon = scene.add
        .image(
          horizontal ? -w / 2 + w * 0.3 : 0,
          horizontal ? 0 : -h * 0.12,
          opts.atlas,
          `${opts.colorIndex}:idle0`,
        )
        .setOrigin(0.5)
        .setScale(scale);
      this.add(icon);
    }
    this.label = scene.add
      .text(
        opts.mini ? 0 : horizontal ? w * 0.2 : 0,
        opts.mini ? 0 : horizontal ? 0 : h * 0.3,
        String(opts.number),
        {
          fontFamily: theme.font,
          fontStyle: "bold",
          fontSize: `${Math.max(8, fontPx)}px`,
          color: "#ffffff",
          stroke: "#140b2e",
          strokeThickness: Math.max(2, Math.round(dpr * 2)),
        },
      )
      .setOrigin(0.5);
    this.add(this.label);
    if (opts.symbol) {
      const size = Math.min(w, h) * (opts.mini ? 0.5 : 0.3);
      const mark = scene.add
        .image(-w / 2 + size * 0.75, -h / 2 + size * 0.75, symbolTexture(scene, opts.colorIndex))
        .setTint(hexToNumber(inkFor(opts.colorHex)))
        .setDisplaySize(size, size);
      this.add(mark);
    }
    this.shown = opts.number;
    this.setSize(w, h);
  }

  /** Shows a new remaining number, with a small pop when it changes. */
  setNumber(n: number): void {
    if (n === this.shown) return;
    this.shown = n;
    this.label.setText(String(n));
    if (isReducedMotion(this.scene)) return;
    this.scene.tweens.killTweensOf(this.label);
    this.label.setScale(1.35);
    this.scene.tweens.add({ targets: this.label, scale: 1, duration: 160, ease: "Back.easeOut" });
  }

  /** A small bump when a cube lands in the portal (decorative: the number itself already shows the truth). */
  pulse(): void {
    if (isReducedMotion(this.scene)) return;
    this.scene.tweens.killTweensOf(this);
    this.setScale(1.08);
    this.scene.tweens.add({ targets: this, scale: 1, duration: 150, ease: "Back.easeOut" });
  }
}
