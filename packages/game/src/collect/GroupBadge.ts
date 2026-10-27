import Phaser from "phaser";
import { isReducedMotion } from "../a11y";
import { hexToNumber, inkFor, theme } from "../theme";
import { symbolTexture, TEX } from "../view/textures";
import { numberLayout } from "./badgeBox";
import { bake } from "./bake";
import { tonesFor } from "./cubePaint";

export interface BadgeOptions {
  w: number;
  h: number;
  colorHex: string;
  colorIndex: number;
  number: number;
  dpr: number;
  /** A queued group behind the front one: only its strip shows, with the number in it. */
  mini?: boolean;
  /** Colour-blind mode: draw the colour's symbol in the corner. */
  symbol?: boolean;
}

/** What a group is doing, which its own box shows (there is no separate "working" area). */
export type BadgeState = "queued" | "working" | "waiting";

/**
 * A summon group: one coloured square with the number of cubes it can still deliver. The number is
 * real remaining capacity (it changes only when a cube is delivered). A working group glows and
 * breathes, a waiting group is dimmed with "zz", and a thin bar along the bottom fills as it delivers.
 */
export class GroupBadge extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly sleep: Phaser.GameObjects.Text;
  private readonly bg: Phaser.GameObjects.Image;
  private mode: BadgeState = "queued";
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
    this.glow = scene.add
      .image(0, 0, TEX.glow)
      .setTint(tones.light)
      .setDisplaySize(w * 1.7, h * 1.7)
      .setAlpha(0);
    this.bg = scene.add.image(0, 0, key).setOrigin(0.5);
    this.bar = scene.add.graphics();
    this.add([this.glow, this.bg, this.bar]);

    const numberAt = numberLayout(w, h, opts.mini === true);
    const fontPx = numberAt.fontPx;
    this.label = scene.add
      .text(numberAt.x, numberAt.y, String(opts.number), {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.max(8, fontPx)}px`,
        color: "#ffffff",
        stroke: "#140b2e",
        strokeThickness: Math.max(2, Math.round(dpr * 2)),
      })
      .setOrigin(0.5);
    this.add(this.label);
    this.sleep = scene.add
      .text(w * 0.3, -h * 0.3, "zz", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.max(8, Math.round(h * 0.2))}px`,
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.add(this.sleep);
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

  /** Shows what the group is doing on the box itself: a breathing glow, or dimmed and asleep. */
  setMode(state: BadgeState): void {
    if (state === this.mode) return;
    this.mode = state;
    this.scene.tweens.killTweensOf(this.glow);
    const reduced = isReducedMotion(this.scene);
    if (state === "working") {
      this.glow.setAlpha(0.55);
      if (!reduced) {
        this.scene.tweens.add({
          targets: this.glow,
          alpha: 0.2,
          scale: this.glow.scale * 1.08,
          duration: 520,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    } else this.glow.setAlpha(0);
    this.bg.setAlpha(state === "waiting" ? 0.62 : 1);
    this.sleep.setAlpha(state === "waiting" ? 0.9 : 0);
  }

  /** How much of the group is delivered (0..1): a thin bar along the bottom of a whole box. */
  setProgress(fraction: number): void {
    if (this.opts.mini) return;
    const { w, h } = this.opts;
    const f = Math.max(0, Math.min(1, fraction));
    this.bar.clear();
    if (f <= 0 || f >= 1) return;
    const bw = w * 0.62;
    const bh = Math.max(2, h * 0.06);
    const y = h / 2 - bh * 2;
    this.bar.fillStyle(0x140b2e, 0.55);
    this.bar.fillRoundedRect(-bw / 2, y, bw, bh, bh / 2);
    this.bar.fillStyle(0xffffff, 0.9);
    this.bar.fillRoundedRect(-bw / 2, y, bw * f, bh, bh / 2);
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
