import Phaser from "phaser";
import { isReducedMotion } from "../a11y";
import { hexToNumber, inkFor, theme } from "../theme";
import { symbolTexture, TEX } from "../view/textures";
import { numberLayout } from "./badgeBox";
import { bake } from "./bake";
import { tonesFor } from "./cubePaint";

/** The cork of a tray's potion bottle, and its darker grain and edge. */
const CORK = 0xd9a86c;
const CORK_EDGE = 0x8a5a2b;

export interface BadgeOptions {
  w: number;
  h: number;
  colorHex: string;
  colorIndex: number;
  number: number;
  dpr: number;
  /** Colour-blind mode: draw the colour's symbol in the corner. */
  symbol?: boolean;
  /** The front look with a sheen (the front row and the trays) or the plain one (the rows behind). Default front. */
  raised?: boolean;
}

/** What a group is doing, which its own box shows (there is no separate "working" area). */
export type BadgeState = "queued" | "working" | "waiting";

/**
 * A summon group: one coloured square with the number of cubes it can still deliver. The number is
 * real remaining capacity (it changes only when a cube is delivered). A working group opens its tray
 * (in a tray it is a potion bottle: the cork lifts and the familiars come out of it), glows and breathes, and
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
  /** The bottle's glass neck and rim (a box in a tray only). */
  private readonly lip: Phaser.GameObjects.Graphics;
  /** Where the bottle's mouth is (local y): the cork sits here and the familiars come out of it. */
  private readonly neckTop: number;
  private readonly lid: Phaser.GameObjects.Graphics;
  /** The front (with a sheen) and back (plain) textures of this box (`setRaised`). */
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
    // Two looks, baked once per colour and size (owner feedback): flat, with no 3D side or shadow,
    // fully opaque; the box you can tap has a soft sheen across the top.
    this.keys = {
      raised: bake(
        scene,
        `badge:front:${opts.colorHex}:${Math.round(w)}x${Math.round(h)}`,
        w,
        h,
        (g) => {
          const rim = Math.max(2, Math.round(dpr * 2));
          g.fillStyle(0xffffff, 1);
          g.fillRoundedRect(0, 0, w, h, radius);
          g.fillStyle(tones.base, 1);
          g.fillRoundedRect(rim, rim, w - 2 * rim, h - 2 * rim, radius * 0.8);
          // A soft sheen across the top: the box you can tap stands out, with no 3D side.
          g.fillStyle(tones.light, 0.45);
          g.fillRoundedRect(rim * 2, rim * 2, w - 4 * rim, (h - 2 * rim) * 0.32, radius * 0.6);
        },
      ),
      flat: bake(
        scene,
        `badge:back:${opts.colorHex}:${Math.round(w)}x${Math.round(h)}`,
        w,
        h,
        (g) => {
          // A thin border: the front box, with its thicker one and the sheen, stands out.
          const rim = Math.max(1, Math.round(dpr * 0.75));
          g.fillStyle(0xffffff, 1);
          g.fillRoundedRect(0, 0, w, h, radius);
          g.fillStyle(tones.base, 1);
          g.fillRoundedRect(rim, rim, w - 2 * rim, h - 2 * rim, radius * 0.8);
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
    // In a tray the box is a potion bottle (owner feedback: a tray should read as a container the
    // familiars come out of; ours is witchy): a glass neck in the box's light colour with a white rim,
    // stoppered with a cork. While the box works the cork lifts off at a tilt and the bottle's mouth
    // shows; the familiars come out of it. Only a box in a tray shows the neck and the cork.
    const neckW = w * 0.44;
    const neckH = h * 0.2;
    this.neckTop = -h / 2 - neckH;
    this.lip = scene.add.graphics();
    this.lip.fillStyle(tones.light, 1);
    this.lip.fillRoundedRect(-neckW / 2, this.neckTop, neckW, neckH + h * 0.08, neckW * 0.2);
    this.lip.lineStyle(Math.max(1.5, lw), 0xffffff, 1);
    this.lip.strokeRoundedRect(-neckW / 2, this.neckTop, neckW, neckH + h * 0.08, neckW * 0.2);
    this.lip.fillStyle(0xffffff, 0.55);
    this.lip.fillRoundedRect(
      -neckW * 0.32,
      this.neckTop + neckH * 0.3,
      neckW * 0.14,
      neckH * 0.6,
      2,
    );
    // The rim round the bottle's mouth.
    this.lip.fillStyle(0xffffff, 1);
    this.lip.fillRoundedRect(
      -neckW * 0.62,
      this.neckTop - h * 0.04,
      neckW * 1.24,
      h * 0.09,
      h * 0.04,
    );
    this.lip.fillStyle(tones.light, 1);
    this.lip.fillRoundedRect(
      -neckW * 0.55,
      this.neckTop - h * 0.025,
      neckW * 1.1,
      h * 0.06,
      h * 0.03,
    );
    this.lip.setAlpha(0);
    this.opening = scene.add.graphics();
    this.opening.fillStyle(tones.dark, 1);
    this.opening.fillEllipse(0, this.neckTop + h * 0.005, neckW * 0.86, h * 0.06);
    this.opening.setAlpha(0);
    // The cork, drawn round its foot so it can lift and tilt from the mouth.
    const corkW = neckW * 0.82;
    const corkH = h * 0.2;
    this.lid = scene.add.graphics();
    this.lid.setPosition(0, this.neckTop);
    this.lid.fillStyle(CORK, 1);
    this.lid.fillRoundedRect(-corkW / 2, -corkH * 0.8, corkW, corkH, corkH * 0.3);
    this.lid.lineStyle(Math.max(1, lw * 0.8), CORK_EDGE, 1);
    this.lid.strokeRoundedRect(-corkW / 2, -corkH * 0.8, corkW, corkH, corkH * 0.3);
    this.lid.fillStyle(CORK_EDGE, 0.55);
    for (const fx of [-0.22, 0.05, 0.28])
      this.lid.fillCircle(
        corkW * fx,
        -corkH * (0.35 + Math.abs(fx) * 0.3),
        Math.max(1, corkH * 0.08),
      );
    this.lid.setAlpha(0);
    this.add([this.glow, this.lip, this.bg, this.bar, this.opening, this.lid]);

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

  /** In a tray the box is a stoppered potion bottle (its cork lifts while it works). */
  setInTray(): void {
    this.setRaised(true);
    this.lip.setAlpha(1);
    this.lid.setAlpha(1);
  }

  /** How far above the box's centre its bottle's mouth is (where the familiars come out). */
  get mouthOffset(): number {
    return -this.neckTop;
  }

  /** The front look (a sheen: the front box of a column, a box in a tray) or the plain one behind it. */
  setRaised(raised: boolean): void {
    const key = raised ? this.keys.raised : this.keys.flat;
    if (this.bg.texture.key !== key) this.bg.setTexture(key);
  }

  /** Stops the glow's endless breathing tween with the badge (a tween on a destroyed child would run on). */
  override destroy(fromScene?: boolean): void {
    this.scene?.tweens.killTweensOf([
      this.glow,
      this.label,
      this,
      this.lid,
      this.opening,
      this.lip,
    ]);
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
    const { w, h } = this.opts;
    const lifted = { x: w * 0.16, y: this.neckTop - h * 0.16, rotation: 0.55 };
    if (isReducedMotion(this.scene) || instant) {
      this.lid.setPosition(lifted.x, lifted.y).setRotation(lifted.rotation);
      this.opening.setAlpha(1);
      this.ready = true;
      return;
    }
    // The cork pops up and tips over, and the mouth shows.
    this.scene.tweens.add({
      targets: this.lid,
      ...lifted,
      delay: delayMs,
      duration: openMs,
      ease: "Back.easeOut",
      onComplete: () => (this.ready = this.open),
    });
    this.scene.tweens.add({ targets: this.opening, alpha: 1, delay: delayMs, duration: openMs });
  }

  /** Closes the bottle (the cork goes back in), then calls `done`; with reduced motion, at once. */
  closeTray(done: () => void): void {
    if (!this.open) {
      done();
      return;
    }
    this.open = false;
    this.ready = false;
    this.scene.tweens.killTweensOf([this.lid, this.opening]);
    if (isReducedMotion(this.scene)) {
      this.lid.setPosition(0, this.neckTop).setRotation(0);
      this.opening.setAlpha(0);
      done();
      return;
    }
    this.scene.tweens.add({
      targets: this.lid,
      x: 0,
      y: this.neckTop,
      rotation: 0,
      duration: 180,
      ease: "Cubic.easeIn",
      onComplete: () => {
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
