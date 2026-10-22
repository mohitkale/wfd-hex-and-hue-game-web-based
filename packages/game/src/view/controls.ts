import Phaser from "phaser";
import { theme } from "../theme";
import { sliderGesture, sliderValue } from "./slider";

/** True while the page is being scrolled: a release then ends the scroll, not a press. */
export type Cancelled = () => boolean;

/**
 * Settings controls drawn in Phaser: a switch, a slider and a segmented choice. All are thumb
 * sized (48 px touch height) and fire on release, like the rest of the game's buttons.
 */

export class Toggle extends Phaser.GameObjects.Container {
  private readonly track: Phaser.GameObjects.Graphics;
  private readonly knob: Phaser.GameObjects.Arc;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly dpr: number,
    private value: boolean,
    onChange: (value: boolean) => void,
    cancelled: Cancelled = () => false,
  ) {
    super(scene, x, y);
    const w = 52 * dpr;
    const h = 30 * dpr;
    this.track = scene.add.graphics();
    this.knob = scene.add.circle(0, 0, h / 2 - 3 * dpr, 0xffffff);
    this.add([this.track, this.knob]);
    // The touch target is taller than the drawn switch.
    this.setSize(w + 16 * dpr, 48 * dpr).setInteractive({ useHandCursor: true });
    let pressed = false;
    this.on("pointerdown", () => (pressed = true))
      .on("pointerout", () => (pressed = false))
      .on("pointerup", () => {
        if (!pressed || cancelled()) return;
        pressed = false;
        this.set(!this.value);
        onChange(this.value);
      });
    this.draw();
    scene.add.existing(this);
  }

  set(value: boolean): this {
    this.value = value;
    this.draw();
    return this;
  }

  private draw(): void {
    const { dpr } = this;
    const w = 52 * dpr;
    const h = 30 * dpr;
    this.track.clear();
    this.track.fillStyle(this.value ? theme.glow : 0x3a2a63, 1);
    this.track.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.knob.setX(this.value ? w / 2 - h / 2 : -w / 2 + h / 2);
    this.knob.setFillStyle(this.value ? 0x1a0f33 : 0xffffff);
  }
}

export class Slider extends Phaser.GameObjects.Container {
  private readonly fill: Phaser.GameObjects.Graphics;
  private readonly knob: Phaser.GameObjects.Arc;

  /** `x`, `y`: left end of the track, vertically centered. */
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly width_: number,
    private readonly dpr: number,
    private value: number,
    onChange: (value: number, done: boolean) => void,
  ) {
    super(scene, x, y);
    this.fill = scene.add.graphics();
    this.knob = scene.add.circle(0, 0, 11 * dpr, 0xffffff).setStrokeStyle(2 * dpr, theme.glow);
    this.add([this.fill, this.knob]);
    const zone = scene.add
      .zone(-12 * dpr, -24 * dpr, width_ + 24 * dpr, 48 * dpr)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.add(zone);
    // One pointer at a time; a press becomes a drag only once it moves sideways (a vertical move
    // scrolls the page instead), and a release without moving is a tap on the track.
    let active = -1;
    let gesture: ReturnType<typeof sliderGesture> = "pending";
    let startX = 0;
    let startY = 0;
    const at = (p: Phaser.Input.Pointer) => sliderValue(p.worldX, this.x, this.width_);
    zone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      active = p.id;
      gesture = "pending";
      startX = p.x;
      startY = p.y;
    });
    const move = (p: Phaser.Input.Pointer) => {
      if (p.id !== active || !p.isDown) return;
      if (gesture === "pending") gesture = sliderGesture(p.x - startX, p.y - startY, 8 * dpr);
      if (gesture !== "drag") return;
      this.set(at(p));
      onChange(this.value, false);
    };
    const up = (p: Phaser.Input.Pointer) => {
      if (p.id !== active) return;
      active = -1;
      if (gesture === "scroll") return;
      this.set(at(p));
      onChange(this.value, true);
    };
    scene.input.on("pointermove", move);
    scene.input.on("pointerup", up);
    this.once("destroy", () => {
      scene.input.off("pointermove", move);
      scene.input.off("pointerup", up);
    });
    this.draw();
    scene.add.existing(this);
  }

  set(value: number): this {
    this.value = Math.min(1, Math.max(0, value));
    this.draw();
    return this;
  }

  private draw(): void {
    const h = 6 * this.dpr;
    const w = this.width_;
    this.fill.clear();
    this.fill.fillStyle(0x3a2a63, 1);
    this.fill.fillRoundedRect(0, -h / 2, w, h, h / 2);
    this.fill.fillStyle(theme.glow, 1);
    this.fill.fillRoundedRect(0, -h / 2, Math.max(h, w * this.value), h, h / 2);
    this.knob.setX(w * this.value);
  }
}

/** A row of choices, one selected. */
export class Segmented extends Phaser.GameObjects.Container {
  private readonly parts: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text }[];

  /** `x`, `y`: center of the control. */
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly segmentW: number,
    private readonly dpr: number,
    private readonly options: readonly { label: string; value: string }[],
    private selected: string,
    onChange: (value: string) => void,
    cancelled: Cancelled = () => false,
  ) {
    super(scene, x, y);
    const h = 40 * dpr;
    const total = segmentW * options.length;
    this.parts = options.map((o, i) => {
      const cx = -total / 2 + segmentW * (i + 0.5);
      const bg = scene.add.graphics({ x: cx, y: 0 });
      const text = scene.add
        .text(cx, 0, o.label, {
          fontFamily: theme.font,
          fontSize: `${Math.round(14 * dpr)}px`,
          color: theme.text,
        })
        .setOrigin(0.5);
      const zone = scene.add
        .zone(cx, 0, segmentW, Math.max(h, 48 * dpr))
        .setInteractive({ useHandCursor: true });
      let pressed = false;
      zone
        .on("pointerdown", () => (pressed = true))
        .on("pointerout", () => (pressed = false))
        .on("pointerup", () => {
          if (!pressed || cancelled()) return;
          pressed = false;
          this.selected = o.value;
          this.draw();
          onChange(o.value);
        });
      this.add([bg, text, zone]);
      return { bg, text };
    });
    this.draw();
    scene.add.existing(this);
  }

  private draw(): void {
    const h = 40 * this.dpr;
    const w = this.segmentW - 4 * this.dpr;
    this.options.forEach((o, i) => {
      const { bg, text } = this.parts[i]!;
      const on = o.value === this.selected;
      bg.clear();
      bg.fillStyle(on ? theme.glow : 0x3a2a63, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      text.setColor(on ? "#1a0f33" : theme.text).setFontStyle(on ? "bold" : "normal");
    });
  }
}
