import type * as collect from "@hexhue/core/collect";
import type Phaser from "phaser";
import { theme } from "../theme";
import { Button } from "../view/Button";
import { TEX } from "../view/textures";
import { ParticleLayer } from "./ParticleLayer";
import {
  effectForTheme,
  particleBudget,
  particleSeeds,
  revealProgress,
  revealTimes,
} from "./completion";
import type { CollectLayout } from "./collectLayout";
import { Particles } from "./particles";
import { fitCell, paintPicture } from "./pictureView";
import { PULSE_MS, sealPoints, sealPulse, type WorldMoment } from "./worldMoment";

export interface CompletionOptions {
  layout: CollectLayout;
  level: collect.CollectLevel & { subject: collect.LevelSubject };
  dpr: number;
  reduced: boolean;
  /** The picture was unlocked by this win (not already in the Spellbook). */
  isNew: boolean;
  /** The win could be written to storage. */
  saved: boolean;
  /** The picture's world: its line, seal and backdrop (null if no world claims it, or it was not saved). */
  world: WorldMoment | null;
  /** Show the finished picture at once (a relayout after the reveal was already seen or skipped). */
  instant: boolean;
  onSpellbook: () => void;
  onAgain: () => void;
}

/** Soft edge of the reveal, as a share of the whole reveal. */
const EDGE = 0.15;

/**
 * The win screen of a v2 level with a known picture: the finished illustration is revealed by its
 * subject's effect (ART_DIRECTION_V2 §9, `completion.ts`), then the name, lore and Spellbook line
 * appear with the buttons. A tap anywhere skips straight to the finished picture, reduced motion
 * shows it at once, and nothing here waits on anything: it is presentation after the game is won.
 * Everything is added to the scene, so the board's rebuild clears it.
 */
export class CompletionOverlay {
  /** Every object this overlay added (the board treats a non-empty overlay as "game over"). */
  readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly spec;
  private readonly times: number[];
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly particles = new Particles(48);
  private readonly particleLayer: ParticleLayer;
  private readonly seeds;
  private readonly later: Phaser.GameObjects.GameObject[] = [];
  private readonly zone: Phaser.GameObjects.Zone;
  private readonly buttons: Phaser.GameObjects.Container[];
  private readonly cell: number;
  private readonly x0: number;
  private readonly y0: number;
  private readonly ring: Phaser.GameObjects.Graphics;
  private pulseOn = false;
  private startedAt = -1;
  private skipped: boolean;
  private finished = false;
  private finishedAt = 0;
  private emitted = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly o: CompletionOptions,
  ) {
    const { layout: l, level, dpr } = o;
    this.skipped = o.instant;
    this.spec = effectForTheme(level.subject.theme);
    this.times = revealTimes(level.width, level.height, this.spec.order);
    this.seeds = particleSeeds(this.spec, level.width, level.height);
    this.cell = fitCell(level, l.frame.w * 0.84, l.frame.h * 0.4);
    this.x0 = Math.round(l.frame.x + (l.frame.w - level.width * this.cell) / 2);
    this.y0 = Math.round(l.frame.y + l.frame.h * 0.07);

    const shade = scene.add
      .rectangle(
        l.frame.x + l.frame.w / 2,
        l.frame.y + l.frame.h / 2,
        l.frame.w,
        l.frame.h,
        o.world?.backdrop ?? 0x140b2e,
        0.86,
      )
      .setDepth(50);
    this.g = scene.add.graphics().setDepth(52);
    this.particleLayer = new ParticleLayer(scene, this.particles, TEX.glow, 53);
    this.ring = scene.add.graphics().setDepth(53);
    this.objects.push(shade, this.g, this.ring);

    const cx = l.frame.x + l.frame.w / 2;
    const picBottom = this.y0 + level.height * this.cell;
    const text = (y: number, s: string, size: number, color: string, bold = false) =>
      scene.add
        .text(cx, y, s, {
          fontFamily: theme.font,
          fontStyle: bold ? "bold" : "normal",
          fontSize: `${Math.round(size * dpr)}px`,
          color,
          align: "center",
          wordWrap: { width: l.frame.w * 0.86 },
        })
        .setOrigin(0.5, 0)
        .setDepth(54)
        .setAlpha(0);
    const name = text(picBottom + 14 * dpr, level.subject.name, 25, "#f6d97a", true);
    const caption = text(name.y + name.height + 4 * dpr, this.spec.caption, 13, theme.textDim);
    const lore = text(caption.y + caption.height + 10 * dpr, level.subject.lore, 15, theme.text);
    let belowLore = lore.y + lore.height + 12 * dpr;
    if (o.world) {
      const worldLine = text(belowLore, o.world.line, 13, hex(o.world.seal.color));
      // The seal sits just left of the line, filled in the world's colour.
      const seal = scene.add.graphics().setDepth(54).setAlpha(0);
      seal.fillStyle(o.world.seal.color, 1);
      seal.beginPath();
      sealPoints(o.world.seal.kind, 8 * dpr).forEach((p, i) =>
        i === 0 ? seal.moveTo(p.x, p.y) : seal.lineTo(p.x, p.y),
      );
      seal.closePath();
      seal.fillPath();
      seal.setPosition(cx - worldLine.width / 2 - 14 * dpr, worldLine.y + worldLine.height / 2);
      this.later.push(worldLine, seal);
      belowLore += worldLine.height + 8 * dpr;
    }
    const book = text(
      belowLore,
      !o.saved
        ? "Could not be saved on this device"
        : o.isNew
          ? "Added to your Spellbook"
          : "Already in your Spellbook",
      13,
      o.isNew && o.saved ? "#f6d97a" : theme.textDim,
      o.isNew && o.saved,
    );
    const bw = Math.min(l.frame.w * 0.6, 220 * dpr);
    const by = Math.min(
      l.frame.y + l.frame.h - 70 * dpr,
      book.y + book.height + 24 * dpr + 24 * dpr,
    );
    const spellbook = new Button(scene, cx, by, bw, "Spellbook", { dpr, onPress: o.onSpellbook })
      .setDepth(54)
      .setAlpha(0);
    const again = new Button(scene, cx, by + 58 * dpr, bw, "Play again", {
      dpr,
      primary: true,
      onPress: o.onAgain,
    })
      .setDepth(54)
      .setAlpha(0);
    scene.add.existing(spellbook);
    scene.add.existing(again);
    this.later.push(name, caption, lore, book, spellbook, again);
    this.objects.push(...this.later);

    // Disabled until the reveal is done so a stray tap cannot press them while they fade in.
    for (const b of [spellbook, again]) b.disableInteractive();
    const zone = scene.add
      .zone(l.frame.x + l.frame.w / 2, l.frame.y + l.frame.h / 2, l.frame.w, l.frame.h)
      .setDepth(55)
      .setInteractive();
    zone.on("pointerdown", () => this.skip());
    this.objects.push(zone);
    this.zone = zone;
    this.buttons = [spellbook, again];
  }

  /** Jumps to the finished picture; the text and buttons follow. */
  skip(): void {
    this.skipped = true;
  }

  get done(): boolean {
    return this.finished;
  }

  /** Call every frame with the scene time. */
  update(now: number): void {
    if (this.finished) {
      // Let the last particles fade out instead of cutting them off.
      this.drawPulse(now);
      if (now - this.finishedAt <= this.spec.particle.lifeMs) this.particleLayer.update(now);
      else if (this.finishedAt >= 0) {
        this.particleLayer.update(-1e9);
        this.finishedAt = -1;
      }
      return;
    }
    if (this.startedAt < 0) this.startedAt = now;
    const elapsed = now - this.startedAt;
    const progress = revealProgress(elapsed, this.spec, {
      reduced: this.o.reduced,
      skipped: this.skipped,
    });
    const level = this.o.level;
    const visible = progress * (1 + EDGE);
    this.g.clear();
    paintPicture(this.g, level, this.x0, this.y0, this.cell, (i) =>
      Math.max(0, Math.min(1, (visible - this.times[i]!) / EDGE)),
    );
    this.emitDue(elapsed);
    this.particleLayer.update(now);
    if (progress >= 1) this.finish(now);
  }

  private emitDue(elapsed: number): void {
    if (this.skipped || particleBudget(this.spec, this.o.reduced) === 0) return;
    const { particle } = this.spec;
    const per = this.cell;
    while (this.emitted < this.seeds.length && this.seeds[this.emitted]!.delayMs <= elapsed) {
      const s = this.seeds[this.emitted++]!;
      this.particles.emit({
        x: this.x0 + s.x * per,
        y: this.y0 + s.y * per,
        vx: (s.vx * per) / 1000,
        vy: (s.vy * per) / 1000,
        born: this.startedAt + s.delayMs,
        life: particle.lifeMs,
        color: particle.color,
        s0: per * 2.2,
        s1: per * 0.6,
        alpha: 0.75,
      });
    }
  }

  /** The world's seal colour as a ring that opens once around the picture (not after a skip). */
  private drawPulse(now: number): void {
    if (!this.pulseOn || !this.o.world) return;
    const p = sealPulse(now - this.finishedAt, { reduced: this.o.reduced, skipped: false });
    this.ring.clear();
    if (p.alpha === 0) {
      if (now - this.finishedAt >= PULSE_MS) this.pulseOn = false;
      return;
    }
    const { level } = this.o;
    const reach = Math.max(level.width, level.height) * this.cell * 0.75;
    this.ring.lineStyle(Math.max(2, this.o.dpr * 2), this.o.world.seal.color, p.alpha);
    this.ring.strokeCircle(
      this.x0 + (level.width * this.cell) / 2,
      this.y0 + (level.height * this.cell) / 2,
      reach * p.radius,
    );
  }

  private finish(now: number): void {
    this.finished = true;
    this.finishedAt = now;
    // A skip, reduced motion or a redraw of a reveal already seen means no pulse.
    this.pulseOn = !this.skipped && !this.o.reduced && !this.o.instant && !!this.o.world;
    this.zone.destroy();
    this.scene.tweens.add({
      targets: this.later,
      alpha: 1,
      duration: this.o.reduced || this.o.instant ? 1 : 300,
      // Pressable only once visible, so a second tap after a skip cannot hit an invisible button.
      onComplete: () => {
        for (const b of this.buttons) b.setInteractive({ useHandCursor: true });
      },
    });
  }
}

/** `0xrrggbb` as a CSS colour string. */
const hex = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;
