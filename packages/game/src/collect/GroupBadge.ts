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
  /** Colour-blind mode: draw the colour's symbol in the corner. */
  symbol?: boolean;
  /** A raised 3D button (the front row and the trays) or a flat tile (the rows behind). Default raised. */
  raised?: boolean;
}

/** What a group is doing, which its own box shows (there is no separate "working" area). */
export type BadgeState = "queued" | "working" | "waiting";

/**
 * A summon group: one coloured square with the number of cubes it can still deliver. The number is
 * real remaining capacity (it changes only when a cube is delivered). A working group opens its tray
 * (the lid swings up behind it, its inside shows, and the familiars come out of it), glows and breathes, and
 * closes the tray again when it is done; a waiting group is dimmed with "zz"; a thin bar along the
 * bottom fills as it delivers.
 */
export class GroupBadge extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly sleep: Phaser.GameObjects.Text;
  private readonly bg: Phaser.GameObjects.Image;
  private readonly opening: Phaser.GameObjects.Graphics;
  private readonly lid: Phaser.GameObjects.Graphics;
  /** The raised and flat textures of this box (`setRaised`). */
  private readonly keys: { raised: string; flat: string };
  private open = false;
  /** The lid has finished opening: familiars may come out (M15.13). */
  private ready = false;
  private readonly glowScale: number;
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
    // Two looks, baked once per colour and size (owner feedback): the box you can tap is a raised
    // button, a glossy face over a deep side and a soft shadow, like the cubes; the boxes behind it
    // are flat tiles, fully opaque so their colours read clearly.
    this.keys = {
      raised: bake(
        scene,
        `badge:raised:${opts.colorHex}:${Math.round(w)}x${Math.round(h)}`,
        w,
        h,
        (g) => {
          const lip = Math.max(3, Math.round(h * 0.15));
          const rim = Math.max(2, Math.round(dpr * 2));
          g.fillStyle(0x000000, 0.22);
          g.fillRoundedRect(1, lip * 0.6, w - 2, h - lip * 0.6, radius);
          g.fillStyle(tones.dark, 1);
          g.fillRoundedRect(0, 0, w, h - 1, radius);
          g.fillStyle(0xffffff, 1);
          g.fillRoundedRect(0, 0, w, h - lip, radius);
          g.fillStyle(tones.base, 1);
          g.fillRoundedRect(rim, rim, w - 2 * rim, h - lip - 2 * rim, radius * 0.8);
          // Gloss across the top of the face, and a glint.
          g.fillStyle(tones.light, 0.55);
          g.fillRoundedRect(rim * 2, rim * 2, w - 4 * rim, (h - lip) * 0.34, radius * 0.6);
          g.fillStyle(0xffffff, 0.7);
          g.fillCircle(
            rim * 2 + radius * 0.6,
            rim * 2 + radius * 0.5,
            Math.max(1.5, radius * 0.28),
          );
        },
      ),
      flat: bake(
        scene,
        `badge:flat:${opts.colorHex}:${Math.round(w)}x${Math.round(h)}`,
        w,
        h,
        (g) => {
          const rim = Math.max(2, Math.round(dpr * 2));
          const lip = Math.max(2, Math.round(h * 0.06));
          g.fillStyle(tones.dark, 1);
          g.fillRoundedRect(0, 0, w, h, radius);
          g.fillStyle(tones.base, 1);
          g.fillRoundedRect(rim, rim, w - 2 * rim, h - 2 * rim - lip, radius * 0.8);
        },
      ),
    };
    this.glow = scene.add
      .image(0, 0, TEX.glow)
      .setTint(tones.light)
      .setDisplaySize(w * 1.7, h * 1.7)
      .setAlpha(0);
    this.glowScale = this.glow.scale;
    this.bg = scene.add.image(0, 0, opts.raised === false ? this.keys.flat : this.keys.raised);
    this.bar = scene.add.graphics();
    // The tray (owner feedback: like a box with its lid open, not a black slot): inside, the box's
    // own colour in shade, its back wall darker; the lid stands open behind it, hinged at the top
    // edge, its underside showing.
    const inner = { x: -w * 0.4, y: -h * 0.5 + h * 0.06, w: w * 0.8, h: h * 0.26 };
    this.opening = scene.add.graphics();
    this.opening.fillStyle(tones.dark, 1);
    this.opening.fillRoundedRect(inner.x, inner.y, inner.w, inner.h, h * 0.06);
    this.opening.fillStyle(0x000000, 0.25);
    this.opening.fillRoundedRect(inner.x, inner.y, inner.w, inner.h * 0.45, h * 0.06);
    this.opening.lineStyle(lw, tones.light, 0.8);
    this.opening.strokeRoundedRect(inner.x, inner.y, inner.w, inner.h, h * 0.06);
    this.opening.setAlpha(0);
    this.lid = scene.add.graphics();
    this.lid.setPosition(0, -h / 2 + lw);
    const lidH = h * 0.42;
    const lid = [
      { x: -w / 2 + lw, y: 0 },
      { x: w / 2 - lw, y: 0 },
      { x: w * 0.44, y: -lidH },
      { x: -w * 0.44, y: -lidH },
    ];
    this.lid.fillStyle(tones.dark, 1);
    shape(this.lid, lid).fillPath();
    this.lid.fillStyle(tones.base, 1);
    shape(this.lid, [
      { x: -w * 0.42, y: -lidH * 0.18 },
      { x: w * 0.42, y: -lidH * 0.18 },
      { x: w * 0.38, y: -lidH * 0.88 },
      { x: -w * 0.38, y: -lidH * 0.88 },
    ]).fillPath();
    this.lid.lineStyle(lw, 0xffffff, 0.9);
    shape(this.lid, lid).strokePath();
    // Closed, the lid lies flat on the hinge (no height); opening raises it.
    this.lid.setScale(1, 0).setAlpha(0);
    this.add([this.glow, this.lid, this.bg, this.bar, this.opening]);

    const numberAt = numberLayout(w, h);
    const fontPx = numberAt.fontPx;
    this.label = scene.add
      .text(numberAt.x, numberAt.y, String(opts.number), {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.max(8, fontPx)}px`,
        color: "#ffffff",
        stroke: `#${tones.dark.toString(16).padStart(6, "0")}`,
        strokeThickness: Math.max(3, Math.round(dpr * 3)),
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
      const size = Math.min(w, h) * 0.3;
      const mark = scene.add
        .image(-w / 2 + size * 0.75, -h / 2 + size * 0.75, symbolTexture(scene, opts.colorIndex))
        .setTint(hexToNumber(inkFor(opts.colorHex)))
        .setDisplaySize(size, size);
      this.add(mark);
    }
    this.shown = opts.number;
    this.setSize(w, h);
  }

  /** In a tray the box is raised (its lid opens while it works). */
  setInTray(): void {
    this.setRaised(true);
  }

  /** The raised 3D button (the front box of a column, a box in a tray) or a flat tile behind it. */
  setRaised(raised: boolean): void {
    const key = raised ? this.keys.raised : this.keys.flat;
    if (this.bg.texture.key !== key) this.bg.setTexture(key);
  }

  /** Stops the glow's endless breathing tween with the badge (a tween on a destroyed child would run on). */
  override destroy(fromScene?: boolean): void {
    this.scene?.tweens.killTweensOf([this.glow, this.label, this, this.lid, this.opening]);
    super.destroy(fromScene);
  }

  /** Shows what the group is doing on the box itself: a breathing glow, or dimmed and asleep. */
  setMode(state: BadgeState): void {
    if (state === this.mode) return;
    this.mode = state;
    this.scene.tweens.killTweensOf(this.glow);
    // A box that stalls and resumes must not multiply the glow's size each time.
    this.glow.setScale(this.glowScale);
    // No glow on working boxes (M15.13): a sober look, and a large blended image per box was GPU cost
    // on integrated graphics. The open tray and the familiars coming out already say it works.
    this.glow.setAlpha(0).setVisible(false);
    this.bg.setAlpha(state === "waiting" ? 0.62 : 1);
    this.sleep.setAlpha(state === "waiting" ? 0.9 : 0);
  }

  private sweptMark: Phaser.GameObjects.Text | null = null;

  /** Besom Sweep (M15.13): a broom on the box while its familiars fly. */
  setSwept(on: boolean): void {
    if (on && !this.sweptMark) {
      const { w, h } = this.opts;
      this.sweptMark = this.scene.add
        .text(-w * 0.32, -h * 0.3, "🧹", { fontSize: `${Math.max(8, Math.round(h * 0.28))}px` })
        .setOrigin(0.5);
      this.add(this.sweptMark);
    } else if (!on && this.sweptMark) {
      this.sweptMark.destroy();
      this.sweptMark = null;
    }
  }

  /** Whether the tray is open (or opening). */
  get isOpen(): boolean {
    return this.open;
  }

  /** Whether the tray is fully open, so familiars can be seen coming out of it. */
  get isReady(): boolean {
    return this.open && this.ready;
  }

  /**
   * Opens the tray: the lid tips back and the dark opening shows, so the familiars can come out.
   * `instant` shows it already open (a box that moved to another place keeps its tray open).
   */
  openTray(instant = false, delayMs = 0, openMs = 160): void {
    if (this.open) return;
    this.open = true;
    this.ready = false;
    this.scene.tweens.killTweensOf([this.lid, this.opening]);
    this.lid.setAlpha(1).setScale(1, 0);
    const reduced = isReducedMotion(this.scene);
    if (reduced || instant) {
      this.lid.setScale(1, 1);
      this.opening.setAlpha(1);
      this.ready = true;
      return;
    }
    this.scene.tweens.add({
      targets: this.lid,
      scaleY: 1,
      delay: delayMs,
      duration: openMs,
      ease: "Cubic.easeOut",
      onComplete: () => (this.ready = this.open),
    });
    this.scene.tweens.add({ targets: this.opening, alpha: 1, delay: delayMs, duration: openMs });
  }

  /** Closes the tray (the lid comes down), then calls `done`; with reduced motion, at once. */
  closeTray(done: () => void): void {
    if (!this.open) {
      done();
      return;
    }
    this.open = false;
    this.ready = false;
    this.scene.tweens.killTweensOf([this.lid, this.opening]);
    if (isReducedMotion(this.scene)) {
      this.lid.setAlpha(0);
      this.opening.setAlpha(0);
      done();
      return;
    }
    this.scene.tweens.add({
      targets: this.lid,
      scaleY: 0,
      duration: 180,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.lid.setAlpha(0);
        this.opening.setAlpha(0);
        done();
      },
    });
    this.scene.tweens.add({ targets: this.opening, alpha: 0, duration: 180 });
  }

  /** How much of the group is delivered (0..1): a thin bar along the bottom of a whole box. */
  setProgress(fraction: number): void {
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

  /** Shows a new remaining number. */
  setNumber(n: number): void {
    // A finished box leaves its tray; it never shows 0 (M15.13).
    if (n === this.shown || n <= 0) return;
    this.shown = n;
    // Just the new number: with a steady stream it changes several times a second, and a pop on each
    // change made the box dance (owner feedback, M15.13).
    this.label.setText(String(n));
  }
}

/** Starts a closed path through `pts` on `g`, ready to fill or stroke. */
function shape(
  g: Phaser.GameObjects.Graphics,
  pts: readonly { x: number; y: number }[],
): Phaser.GameObjects.Graphics {
  g.beginPath();
  pts.forEach((q, i) => (i === 0 ? g.moveTo(q.x, q.y) : g.lineTo(q.x, q.y)));
  g.closePath();
  return g;
}
