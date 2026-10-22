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
import { INSTALL_AFTER_WINS, canInstall, onInstallChange, promptInstall } from "../pwa";
import { getSave } from "../save";
import type { SaveData } from "../save/schema";
import { theme } from "../theme";
import { DragScroll, takeRestoredScroll } from "../view/DragScroll";
import { ensureTextures, TEX } from "../view/textures";
import { fadeIn, go } from "../view/transition";
import { syncPlan } from "../view/virtual";
import type { PlayData } from "./PlayScene";

/** Section tint per world, in play order. */
const TINTS = [0x2a1650, 0x123c3c, 0x1c1a4a];

/** Margin-zone nodes built per frame while scrolling (viewport nodes are built at once). */
const NODES_PER_FRAME = 3;

/** "Not now" on the install offer hides it for this long (per device: install is per device). */
const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const INSTALL_SNOOZE_KEY = "hexhue:installSnoozedAt";

function installSnoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(INSTALL_SNOOZE_KEY));
    return Number.isFinite(at) && Date.now() - at < INSTALL_SNOOZE_MS;
  } catch {
    return false;
  }
}

function snoozeInstall(): void {
  try {
    localStorage.setItem(INSTALL_SNOOZE_KEY, String(Date.now()));
  } catch {
    // Storage blocked: the offer just comes back next visit.
  }
}

interface NodeState {
  unlocked: boolean;
  stars: number;
  skipped: boolean;
  isNext: boolean;
  captionLeft: boolean;
  dpr: number;
}

/** Everything needed to build a level node when it scrolls near the viewport. */
interface NodeSpec {
  x: number;
  y: number;
  r: number;
  number: number;
  name: string;
  data: PlayData;
  state: NodeState;
}

/**
 * The world map: each world is a tinted section with its progress, and its levels sit along a
 * winding path. Completed levels show their stars, the next level glows, locked levels are dim
 * and explain what opens them. Opens scrolled to the next level.
 */
export class WorldMapScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];
  /** Level nodes are built lazily near the viewport (see view/virtual.ts). */
  private nodeSpecs: NodeSpec[] = [];
  private nodeObjects = new Map<number, Phaser.GameObjects.GameObject[]>();
  /** `nodeSpecs` y positions (cached for the per-frame sync). */
  private nodeYs: number[] = [];
  /** The viewport the last sync settled for; nothing to do while it is unchanged. */
  private syncedView = "";
  private readonly haptics = new Haptics();
  private scroller!: DragScroll;
  private focusY: number | null = null;
  private toast: Phaser.GameObjects.Text | null = null;

  constructor() {
    super("levels");
  }

  create(): void {
    this.objects = [];
    this.nodeSpecs = [];
    this.nodeObjects = new Map();
    this.nodeYs = [];
    this.syncedView = "";
    this.toast = null;
    ensureTextures(this);
    this.cameras.main.setBackgroundColor(theme.night);
    this.haptics.enabled = getSave(this)?.data.settings.haptics ?? true;
    this.scroller = new DragScroll(this, (this.registry.get("dpr") as number | undefined) ?? 1);
    this.scale.on("resize", this.layout, this);
    const offInstall = onInstallChange(() => this.layout());
    this.events.once("shutdown", () => {
      this.scale.off("resize", this.layout, this);
      offInstall();
    });
    this.layout();
    // Open on the level to play next (or where the map was, after a pixel-ratio change).
    const { height } = this.scale.gameSize;
    const restored = takeRestoredScroll(
      this,
      (this.registry.get("dpr") as number | undefined) ?? 1,
    );
    this.scroller.scrollTo(restored ?? (this.focusY !== null ? this.focusY - height * 0.45 : 0));
    fadeIn(this);
  }

  override update(): void {
    this.syncNodes();
  }

  /** Builds nodes scrolling into view and drops those far away. */
  private syncNodes(): void {
    const camera = this.cameras.main;
    const { height } = this.scale.gameSize;
    const view = `${camera.scrollY}:${height}`;
    if (view === this.syncedView) return;
    const plan = syncPlan(
      this.nodeYs,
      new Set(this.nodeObjects.keys()),
      camera.scrollY,
      height,
      height,
      NODES_PER_FRAME,
    );
    for (const i of plan.destroy) {
      for (const o of this.nodeObjects.get(i)!) {
        this.tweens.killTweensOf(o);
        o.destroy();
      }
      this.nodeObjects.delete(i);
    }
    for (const i of plan.create) {
      const n = this.nodeSpecs[i]!;
      this.nodeObjects.set(i, this.node(n.x, n.y, n.r, n.number, n.name, n.data, n.state));
    }
    // Settled once the margin is fully built (the budget left nothing for later frames).
    if (plan.create.length < NODES_PER_FRAME) this.syncedView = view;
  }

  private save(): Pick<SaveData, "levels" | "skipped"> {
    return getSave(this)?.data ?? { levels: {}, skipped: [] };
  }

  private layout(): void {
    // Kill looping halo tweens before their targets go away.
    this.tweens.killAll();
    for (const o of this.objects) o.destroy();
    this.objects = [];
    for (const list of this.nodeObjects.values()) for (const o of list) o.destroy();
    this.nodeObjects.clear();
    this.nodeSpecs = [];
    this.syncedView = "";
    // killAll above stopped the toast's fade: drop it rather than leave it stuck on screen.
    this.toast?.destroy();
    this.toast = null;
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
      // Path dots: one batched Blitter per world (a Graphics would be re-tessellated every frame).
      const dot = this.dotTexture(px(2));
      const path = this.add.blitter(0, 0, dot);
      const half = px(2) + 1;
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i]!;
        const b = nodes[i + 1]!;
        const lit = isPassed(save, world.levels[i]!.level.id);
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / px(9));
        for (let k = 1; k < steps; k++) {
          path
            .create(a.x + ((b.x - a.x) * k) / steps - half, a.y + ((b.y - a.y) * k) / steps - half)
            .setTint(lit ? theme.glow : theme.mist)
            .setAlpha(lit ? 0.7 : 0.25);
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
        this.nodeSpecs.push({
          x,
          y: ny,
          r: px(26),
          number: i + 1,
          name: built.level.name,
          data,
          state: {
            unlocked: isUnlocked(worlds, save, w, i),
            stars: getSave(this)?.data.levels[built.level.id]?.stars ?? 0,
            skipped: !isCompleted(save, built.level.id) && isPassed(save, built.level.id),
            isNext,
            captionLeft: x > cx,
            dpr,
          },
        });
      });
      y += sectionH + px(16);
    });

    // Install offer (where the browser supports it), once the player has won a couple of levels.
    const offerInstall =
      canInstall() &&
      !installSnoozed() &&
      (getSave(this)?.data.stats.wins ?? 0) >= INSTALL_AFTER_WINS;
    this.nodeYs = this.nodeSpecs.map((n) => n.y);
    // Room at the end so the pinned install offer never covers the last line of the map.
    this.scroller.setMax(y + insets.bottom + px(offerInstall ? 96 : 24) - height);

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
    const iconX = left + px(4) + touch / 2;
    const iconY = insets.top + px(28);
    const title = this.add
      .text(iconX, iconY, "♪", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${px(22)}px`,
        color: theme.text,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11);
    // Muted: a drawn slash (font-independent) and a dimmer note.
    const slash = this.add.graphics().setScrollFactor(0).setDepth(12);
    slash.lineStyle(Math.max(2, 2 * dpr), 0xff8fa3, 1);
    slash.lineBetween(iconX - px(11), iconY + px(11), iconX + px(11), iconY - px(11));
    const showSound = (on: boolean) => {
      title.setColor(on ? theme.text : theme.textDim);
      slash.setVisible(!on);
    };
    showSound(soundOn());
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
        showSound(next);
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
      .on("pointerup", () => bookPressed && go(this, "spellbook"));
    this.objects.push(bar, soundZone, title, slash, stars, book);

    if (offerInstall) this.drawInstallOffer(cx, height - insets.bottom - px(16), px);
  }

  /** "⤓ Install … · Not now", pinned above the bottom edge. */
  private drawInstallOffer(cx: number, bottom: number, px: (v: number) => number): void {
    const button = (label: string, primary: boolean, onPress: () => void) => {
      let pressed = false;
      return this.add
        .text(0, bottom, label, {
          fontFamily: theme.font,
          fontStyle: primary ? "bold" : "normal",
          fontSize: `${px(14)}px`,
          color: primary ? "#1a0f33" : theme.text,
          backgroundColor: primary ? "#f6d97a" : "#2a1650",
          padding: { x: px(16), y: px(15) },
        })
        .setOrigin(0, 1)
        .setScrollFactor(0)
        .setDepth(11)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => (pressed = true))
        .on("pointerout", () => (pressed = false))
        .on("pointerup", () => {
          if (!pressed || this.scroller.dragging) return;
          for (const o of offer) o.destroy();
          onPress();
        });
    };
    const install = button("⤓ Install Hex & Hue", true, () => void promptInstall());
    const later = button("Not now", false, snoozeInstall);
    const gap = px(8);
    const total = install.width + gap + later.width;
    install.setX(cx - total / 2);
    later.setX(cx - total / 2 + install.width + gap);
    const offer = [install, later];
    this.objects.push(...offer);
  }

  private node(
    x: number,
    y: number,
    r: number,
    number: number,
    name: string,
    data: PlayData,
    state: NodeState,
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
      });
      go(this, "play", data);
    });
    return out;
  }

  /** A padlock, drawn once per size into a texture and shown as a cheap Image. */
  private lockIcon(x: number, y: number, size: number, dpr: number): Phaser.GameObjects.Image {
    const s = Math.round(size);
    const key = `lock-${s}-${dpr}`;
    if (!this.textures.exists(key)) {
      const line = Math.max(1, 2 * dpr);
      const box = s + 2 * line;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      const cx = box / 2;
      const cy = box / 2 + s * 0.1;
      g.lineStyle(line, theme.mist, 0.6);
      g.beginPath();
      g.arc(cx, cy - s * 0.15, s * 0.35, Math.PI, 0);
      g.strokePath();
      g.fillStyle(theme.mist, 0.6);
      g.fillRoundedRect(cx - s * 0.5, cy - s * 0.15, s, s * 0.75, s * 0.12);
      g.generateTexture(key, box, box);
      g.destroy();
    }
    return this.add.image(x, y, key);
  }

  /** A filled white dot texture of radius `r`, tinted per Blitter bob. */
  private dotTexture(r: number): string {
    const key = `dot-${r}`;
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(r + 1, r + 1, r);
      g.generateTexture(key, 2 * r + 2, 2 * r + 2);
      g.destroy();
    }
    return key;
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
