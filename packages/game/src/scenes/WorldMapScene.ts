import Phaser from "phaser";
import { getAudio } from "../audio";
import { Haptics } from "../haptics";
import { worlds } from "../levels";
import {
  gatingLevel,
  isCompleted,
  isPassed,
  isUnlocked,
  nextLevel,
  worldProgress,
} from "../progress";
import { getSave } from "../save";
import type { SaveData } from "../save/schema";
import { theme } from "../theme";
import { DragScroll } from "../view/DragScroll";
import { ensureTextures, TEX } from "../view/textures";
import type { PlayData } from "./PlayScene";

/** Section tint per world, in play order. */
const TINTS = [0x2a1650, 0x123c3c, 0x1c1a4a];

/**
 * The world map: each world is a tinted section with its progress, and its levels sit along a
 * winding path. Completed levels show their stars, the next level glows, locked levels are dim
 * and explain what opens them. Opens scrolled to the next level.
 */
export class WorldMapScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private readonly haptics = new Haptics();
  private scroller!: DragScroll;
  private focusY: number | null = null;
  private toast: Phaser.GameObjects.Text | null = null;

  constructor() {
    super("levels");
  }

  create(): void {
    this.objects = [];
    this.toast = null;
    ensureTextures(this);
    this.cameras.main.setBackgroundColor(theme.night);
    this.haptics.enabled = getSave(this)?.data.settings.haptics ?? true;
    this.scroller = new DragScroll(this, (this.registry.get("dpr") as number | undefined) ?? 1);
    this.scale.on("resize", this.layout, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.layout, this));
    this.layout();
    // Open on the level to play next.
    const { height } = this.scale.gameSize;
    this.scroller.scrollTo(this.focusY !== null ? this.focusY - height * 0.45 : 0);
  }

  private save(): Pick<SaveData, "levels" | "skipped"> {
    return getSave(this)?.data ?? { levels: {}, skipped: [] };
  }

  private layout(): void {
    // Kill looping halo tweens before their targets go away.
    this.tweens.killAll();
    for (const o of this.objects) o.destroy();
    this.objects = [];
    const { width, height } = this.scale.gameSize;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const insets = (this.registry.get("insets") as { top: number; bottom: number } | undefined) ?? {
      top: 0,
      bottom: 0,
    };
    const px = (v: number) => Math.round(v * dpr);
    const frameW = Math.min(width, px(480));
    const left = (width - frameW) / 2;
    const cx = width / 2;
    const save = this.save();
    const next = nextLevel(worlds, save);
    const barH = insets.top + px(56);
    let y = barH + px(16);
    this.focusY = null;

    worlds.forEach((world, w) => {
      const progress = worldProgress(world, save);
      const sectionTop = y;
      const nodeGap = px(78);
      const headerH = px(78);
      const sectionH = headerH + world.levels.length * nodeGap + px(12);

      const bg = this.add.graphics();
      bg.fillStyle(TINTS[w % TINTS.length]!, 0.55);
      bg.fillRoundedRect(left + px(8), sectionTop, frameW - px(16), sectionH, px(24));
      this.objects.push(bg);

      this.objects.push(
        this.add
          .text(left + px(28), sectionTop + px(16), world.name, {
            fontFamily: theme.font,
            fontStyle: "bold",
            fontSize: `${px(20)}px`,
            color: theme.text,
          })
          .setOrigin(0, 0),
        this.add
          .text(
            left + px(28),
            sectionTop + px(46),
            `★ ${progress.stars}/${progress.maxStars}   ·   ${progress.completed}/${progress.total} mosaics`,
            { fontFamily: theme.font, fontSize: `${px(13)}px`, color: "#f6d97a" },
          )
          .setOrigin(0, 0),
      );

      // Winding path through the level nodes.
      const amp = frameW * 0.26;
      const nodes = world.levels.map((_, i) => ({
        x: cx + amp * Math.sin(i * 0.9 + w),
        y: sectionTop + headerH + i * nodeGap + nodeGap / 2,
      }));
      const path = this.add.graphics();
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i]!;
        const b = nodes[i + 1]!;
        const lit = isPassed(save, world.levels[i]!.level.id);
        path.fillStyle(lit ? theme.glow : theme.mist, lit ? 0.7 : 0.25);
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / px(9));
        for (let k = 1; k < steps; k++) {
          path.fillCircle(a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps, px(2));
        }
      }
      this.objects.push(path);

      world.levels.forEach((built, i) => {
        const { x, y: ny } = nodes[i]!;
        const data: PlayData = { world: w, level: i };
        const isNext = next?.world === w && next.level === i;
        if (isNext) this.focusY = ny;
        else if (!next && w === worlds.length - 1 && i === world.levels.length - 1)
          this.focusY = ny;
        this.objects.push(
          ...this.node(x, ny, px(26), i + 1, built.level.name, data, {
            unlocked: isUnlocked(worlds, save, w, i),
            stars: getSave(this)?.data.levels[built.level.id]?.stars ?? 0,
            skipped: !isCompleted(save, built.level.id) && isPassed(save, built.level.id),
            isNext,
            captionLeft: x > cx,
            dpr,
          }),
        );
      });
      y += sectionH + px(16);
    });

    this.scroller.setMax(y + insets.bottom + px(24) - height);

    // Sticky top bar with the title and total stars.
    // Interactive so taps on the bar never reach a node scrolled underneath it.
    const bar = this.add
      .rectangle(0, 0, width, barH, theme.night, 0.94)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(10)
      .setInteractive();
    const total = worlds.reduce((n, w) => n + worldProgress(w, save).stars, 0);
    if (!next) {
      // Everything passed: celebrate at the end of the path.
      this.objects.push(
        this.add
          .text(cx, y - px(4), "All mosaics complete ✦", {
            fontFamily: theme.font,
            fontStyle: "bold",
            fontSize: `${px(16)}px`,
            color: "#f6d97a",
          })
          .setOrigin(0.5, 1),
      );
    }
    // Sound toggle (all audio) on the left; volumes live in Settings (M6.5).
    const soundOn = () => {
      const st = getSave(this)?.data.settings;
      return st ? st.sound || st.music : true;
    };
    const touch = px(48);
    const soundZone = this.add
      .zone(left + px(4), insets.top + (px(56) - touch) / 2, touch, touch)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });
    const title = this.add
      .text(left + px(4) + touch / 2, insets.top + px(28), soundOn() ? "♪" : "♪̸", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${px(22)}px`,
        color: soundOn() ? theme.text : theme.textDim,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11);
    let soundPressed = false;
    soundZone
      .on("pointerdown", () => (soundPressed = true))
      .on("pointerout", () => (soundPressed = false))
      .on("pointerup", () => {
        if (!soundPressed) return;
        const next = !soundOn();
        getSave(this)?.update((d) => {
          d.settings.sound = next;
          d.settings.music = next;
        });
        title.setText(next ? "♪" : "♪̸").setColor(next ? theme.text : theme.textDim);
        if (next) getAudio(this).play("ui");
      });
    const stars = this.add
      .text(left + frameW - px(20), insets.top + px(28), `★ ${total}`, {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${px(18)}px`,
        color: "#f6d97a",
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(11);
    // Spellbook entry, between the title and the stars.
    const book = this.add
      .text(left + frameW / 2, insets.top + px(28), "✦ Spellbook", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${px(14)}px`,
        color: theme.text,
        backgroundColor: "#2a1650",
        padding: { x: px(12), y: px(16) },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });
    let bookPressed = false;
    book
      .on("pointerdown", () => (bookPressed = true))
      .on("pointerout", () => (bookPressed = false))
      .on("pointerup", () => bookPressed && this.scene.start("spellbook"));
    this.objects.push(bar, soundZone, title, stars, book);
  }

  private node(
    x: number,
    y: number,
    r: number,
    number: number,
    name: string,
    data: PlayData,
    state: {
      unlocked: boolean;
      stars: number;
      skipped: boolean;
      isNext: boolean;
      captionLeft: boolean;
      dpr: number;
    },
  ): Phaser.GameObjects.GameObject[] {
    const { dpr, unlocked, stars, isNext, skipped } = state;
    const out: Phaser.GameObjects.GameObject[] = [];
    if (isNext) {
      const halo = this.add
        .image(x, y, TEX.glow)
        .setTint(theme.glow)
        .setDisplaySize(r * 4, r * 4)
        .setAlpha(0.7);
      this.tweens.add({
        targets: halo,
        scale: halo.scale * 1.25,
        alpha: 0.35,
        duration: 900,
        yoyo: true,
        repeat: -1,
      });
      out.push(halo);
    }
    const fill = isNext ? theme.glow : stars > 0 ? 0x4a2f7a : unlocked ? theme.dusk : 0x1a1236;
    const disc = this.add
      .circle(x, y, r, fill)
      .setStrokeStyle(
        Math.max(1, 2 * dpr),
        unlocked ? theme.glow : theme.mist,
        unlocked ? 0.95 : 0.25,
      )
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x, y, unlocked ? String(number) : "", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(r * 0.8)}px`,
        color: isNext ? "#1a0f33" : theme.text,
      })
      .setOrigin(0.5);
    out.push(disc, label);
    if (!unlocked) out.push(this.lockIcon(x, y, r * 0.55, dpr));
    if (stars > 0) {
      out.push(
        this.add
          .text(x, y - r - 2 * dpr, "★".repeat(stars) + "☆".repeat(3 - stars), {
            fontFamily: theme.font,
            fontSize: `${Math.round(12 * dpr)}px`,
            color: "#f6d97a",
          })
          .setOrigin(0.5, 1),
      );
    }
    const caption = this.add
      .text(
        state.captionLeft ? x - r - 10 * dpr : x + r + 10 * dpr,
        y,
        isNext ? `${name}\nPlay ›` : skipped ? `${name}\nTry again ›` : name,
        {
          fontFamily: theme.font,
          fontSize: `${Math.round(12 * dpr)}px`,
          color: isNext ? "#f6d97a" : unlocked ? theme.textDim : "#6d6292",
          align: state.captionLeft ? "right" : "left",
          wordWrap: { width: 120 * dpr },
        },
      )
      .setOrigin(state.captionLeft ? 1 : 0, 0.5);
    out.push(caption);

    let pressed = false;
    disc.on("pointerdown", () => (pressed = true));
    disc.on("pointerout", () => (pressed = false));
    disc.on("pointerup", () => {
      if (!pressed || this.scroller.dragging) return;
      pressed = false;
      if (!unlocked) {
        this.haptics.play("invalid");
        getAudio(this).play("invalid");
        this.tweens.add({
          targets: [disc, label],
          x: { from: x - 5 * dpr, to: x },
          duration: 260,
          ease: "Bounce.easeOut",
        });
        const gate = gatingLevel(worlds, data);
        const gateName = gate ? worlds[gate.world]!.levels[gate.level]!.level.name : "";
        this.showToast(`Finish “${gateName}” to open this one`);
        return;
      }
      this.haptics.play("tap");
      getAudio(this).play("tap");
      this.tweens.add({
        targets: [disc, label],
        scale: 0.9,
        duration: 70,
        yoyo: true,
        onComplete: () => this.scene.start("play", data),
      });
    });
    return out;
  }

  private lockIcon(x: number, y: number, size: number, dpr: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics({ x, y });
    g.lineStyle(Math.max(1, 2 * dpr), theme.mist, 0.6);
    g.beginPath();
    g.arc(0, -size * 0.15, size * 0.35, Math.PI, 0);
    g.strokePath();
    g.fillStyle(theme.mist, 0.6);
    g.fillRoundedRect(-size * 0.5, -size * 0.15, size, size * 0.75, size * 0.12);
    return g;
  }

  private showToast(message: string): void {
    const { width, height } = this.scale.gameSize;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const bottom = (this.registry.get("insets") as { bottom: number } | undefined)?.bottom ?? 0;
    this.toast?.destroy();
    this.toast = this.add
      .text(width / 2, height - bottom - 80 * dpr, message, {
        fontFamily: theme.font,
        fontSize: `${Math.round(14 * dpr)}px`,
        color: theme.text,
        backgroundColor: "#2a1650",
        padding: { x: Math.round(14 * dpr), y: Math.round(10 * dpr) },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1600, duration: 400 });
  }
}
