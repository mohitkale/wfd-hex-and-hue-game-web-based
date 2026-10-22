import Phaser from "phaser";
import type { BuiltLevel } from "@hexhue/core";
import { Haptics } from "../haptics";
import { worlds } from "../levels";
import { isCompleted, worldProgress } from "../progress";
import { getSave } from "../save";
import { theme } from "../theme";
import { artTexture } from "../view/artThumb";
import { Button } from "../view/Button";
import { DragScroll } from "../view/DragScroll";

/**
 * The Spellbook: every mosaic the player has completed, as a collectible page with its lore.
 * Uncollected ones show as silhouettes — a promise, not a lock. World progress sits on each
 * section; completing a world earns its seal.
 */
export class SpellbookScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private page: Phaser.GameObjects.GameObject[] = [];
  private scroller!: DragScroll;
  private readonly haptics = new Haptics();

  constructor() {
    super("spellbook");
  }

  create(): void {
    this.objects = [];
    this.page = [];
    this.cameras.main.setBackgroundColor(theme.night);
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    this.haptics.enabled = getSave(this)?.data.settings.haptics ?? true;
    this.scroller = new DragScroll(this, dpr);
    this.scale.on("resize", this.layout, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.layout, this));
    this.layout();
  }

  private layout(): void {
    this.tweens.killAll();
    for (const o of [...this.objects, ...this.page]) o.destroy();
    this.objects = [];
    this.page = [];
    const { width, height } = this.scale.gameSize;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const insets = (this.registry.get("insets") as { top: number; bottom: number } | undefined) ?? {
      top: 0,
      bottom: 0,
    };
    const px = (v: number) => Math.round(v * dpr);
    const frameW = Math.min(width, px(480));
    const left = (width - frameW) / 2;
    const save = getSave(this)?.data ?? { levels: {}, skipped: [] };
    const barH = insets.top + px(56);
    let y = barH + px(12);

    const cols = 3;
    const gap = px(12);
    const cardW = Math.floor((frameW - px(32) - (cols - 1) * gap) / cols);
    const thumb = cardW - px(16);

    worlds.forEach((world) => {
      const p = worldProgress(world, save);
      const done = p.completed === p.total;
      this.objects.push(
        this.add.text(left + px(16), y, world.name, {
          fontFamily: theme.font,
          fontStyle: "bold",
          fontSize: `${px(19)}px`,
          color: theme.text,
        }),
        this.add
          .text(
            left + frameW - px(16),
            y + px(2),
            done ? "World complete ✦" : `${p.completed}/${p.total}`,
            {
              fontFamily: theme.font,
              fontSize: `${px(13)}px`,
              color: done ? "#f6d97a" : theme.textDim,
            },
          )
          .setOrigin(1, 0),
      );
      y += px(30);
      const bar = this.add.graphics();
      bar.fillStyle(theme.dusk, 1);
      bar.fillRoundedRect(left + px(16), y, frameW - px(32), px(6), px(3));
      bar.fillStyle(theme.glow, 1);
      bar.fillRoundedRect(
        left + px(16),
        y,
        Math.max(px(6), (frameW - px(32)) * (p.completed / p.total)),
        px(6),
        px(3),
      );
      this.objects.push(bar);
      y += px(18);

      world.levels.forEach((built, i) => {
        const x = left + px(16) + (i % cols) * (cardW + gap);
        const cy = y + Math.floor(i / cols) * (cardW + px(30));
        this.objects.push(
          ...this.card(x, cy, cardW, thumb, built, isCompleted(save, built.level.id), dpr),
        );
      });
      y += Math.ceil(world.levels.length / cols) * (cardW + px(30)) + px(20);
    });
    this.scroller.setMax(y + insets.bottom + px(16) - height);

    // Sticky bar (interactive so it blocks taps on cards scrolled beneath it).
    const barBg = this.add
      .rectangle(0, 0, width, barH, theme.night, 0.95)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(10)
      .setInteractive();
    const total = worlds.reduce((n, w) => n + worldProgress(w, save).completed, 0);
    const count = worlds.reduce((n, w) => n + w.levels.length, 0);
    const touch = px(48);
    const back = this.add
      .zone(left + px(4), insets.top + (px(56) - touch) / 2, touch, touch)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(11)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.scene.start("levels"));
    this.objects.push(
      barBg,
      back,
      this.add
        .text(left + px(4) + touch / 2, insets.top + px(28), "‹", {
          fontFamily: theme.font,
          fontSize: `${px(34)}px`,
          color: theme.text,
        })
        .setOrigin(0.5, 0.55)
        .setScrollFactor(0)
        .setDepth(11),
      this.add
        .text(left + frameW / 2, insets.top + px(28), "Spellbook", {
          fontFamily: theme.font,
          fontStyle: "bold",
          fontSize: `${px(20)}px`,
          color: theme.text,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(11),
      this.add
        .text(left + frameW - px(16), insets.top + px(28), `${total}/${count}`, {
          fontFamily: theme.font,
          fontSize: `${px(14)}px`,
          color: "#f6d97a",
        })
        .setOrigin(1, 0.5)
        .setScrollFactor(0)
        .setDepth(11),
    );
  }

  private card(
    x: number,
    y: number,
    w: number,
    thumb: number,
    built: BuiltLevel,
    collected: boolean,
    dpr: number,
  ): Phaser.GameObjects.GameObject[] {
    const level = built.level;
    const bg = this.add.graphics();
    bg.fillStyle(collected ? theme.dusk : 0x1a1236, 1);
    bg.fillRoundedRect(x, y, w, w, 12 * dpr);
    const cell = Math.max(1, Math.floor(thumb / Math.max(level.width, level.height)));
    const img = this.add
      .image(x + w / 2, y + w / 2, artTexture(this, level, cell, !collected))
      .setAlpha(collected ? 1 : 0.7);
    const caption = this.add
      .text(x + w / 2, y + w + 4 * dpr, collected ? level.name : "? ? ?", {
        fontFamily: theme.font,
        fontSize: `${Math.round(11 * dpr)}px`,
        color: collected ? theme.text : theme.textDim,
        align: "center",
        wordWrap: { width: w },
      })
      .setOrigin(0.5, 0);
    const hit = this.add
      .zone(x, y, w, w)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: collected });
    let pressed = false;
    hit.on("pointerdown", () => (pressed = true));
    hit.on("pointerout", () => (pressed = false));
    hit.on("pointerup", () => {
      if (!pressed || this.scroller.dragging) return;
      pressed = false;
      if (collected) {
        this.haptics.play("tap");
        this.openPage(built);
      } else {
        this.haptics.play("invalid");
      }
    });
    return [bg, img, caption, hit];
  }

  /** A full page for one collected mosaic: large art, stars and its lore. */
  private openPage(built: BuiltLevel): void {
    for (const o of this.page) o.destroy();
    const { width, height } = this.scale.gameSize;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const px = (v: number) => Math.round(v * dpr);
    const w = Math.min(width - px(32), px(400));
    const level = built.level;
    const stars = getSave(this)?.data.levels[level.id]?.stars ?? 0;
    const cell = Math.max(2, Math.floor((w - px(48)) / Math.max(level.width, level.height)));
    const cx = width / 2;
    const top = Math.max(px(40), (height - (level.height * cell + px(260))) / 2);

    const dim = this.add
      .rectangle(0, 0, width, height, 0x07040f, 0.8)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(20)
      .setInteractive();
    const panel = this.add.graphics().setScrollFactor(0).setDepth(20);
    const art = this.add
      .image(cx, top + px(24) + (level.height * cell) / 2, artTexture(this, level, cell))
      .setScrollFactor(0)
      .setDepth(21);
    let ty = top + px(36) + level.height * cell;
    const text = (
      value: string,
      size: number,
      color: string,
      style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
    ) => {
      const t = this.add
        .text(cx, ty, value, {
          fontFamily: theme.font,
          fontSize: `${px(size)}px`,
          color,
          align: "center",
          wordWrap: { width: w - px(40) },
          ...style,
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(21);
      ty += t.height + px(8);
      return t;
    };
    const parts: Phaser.GameObjects.GameObject[] = [
      text(level.name, 22, theme.text, { fontStyle: "bold" }),
      text("★".repeat(stars) + "☆".repeat(3 - stars), 16, "#f6d97a"),
      text(built.lore, 15, theme.textDim, { fontStyle: "italic" }),
    ];
    ty += px(28);
    const close = new Button(this, cx, ty, px(160), "Close", {
      dpr,
      onPress: () => this.closePage(),
    });
    close.setScrollFactor(0).setDepth(21);
    const bottom = ty + px(36);
    panel.fillStyle(theme.panel, 0.98);
    panel.fillRoundedRect(cx - w / 2, top, w, bottom - top, px(20));
    panel.lineStyle(Math.max(1, dpr * 1.5), theme.mist, 0.35);
    panel.strokeRoundedRect(cx - w / 2, top, w, bottom - top, px(20));
    dim.on("pointerup", () => this.closePage());
    this.page = [dim, panel, art, ...parts, close];
  }

  private closePage(): void {
    for (const o of this.page) o.destroy();
    this.page = [];
  }
}
