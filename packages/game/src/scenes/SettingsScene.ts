import Phaser from "phaser";
import { getAnalytics, privacySignal, readConsent, writeConsent } from "../analytics";
import { getAudio } from "../audio";
import { getSave } from "../save";
import type { Settings } from "../save/schema";
import { theme } from "../theme";
import { Segmented, Slider, Toggle } from "../view/controls";
import { DragScroll, takeRestoredScroll } from "../view/DragScroll";
import { ensureTextures, symbolTexture } from "../view/textures";
import { fadeIn, go } from "../view/transition";

/**
 * Settings: sound and music (each with a volume), vibration, colorblind symbols, reduced motion,
 * and replaying the tutorial. Every change is saved at once and takes effect immediately (audio,
 * motion) or on the next level (symbols, vibration).
 */
export class SettingsScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private scroller!: DragScroll;

  constructor() {
    super("settings");
  }

  create(): void {
    this.objects = [];
    ensureTextures(this);
    this.cameras.main.setBackgroundColor(theme.night);
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    this.scroller = new DragScroll(this, dpr);
    this.scale.on("resize", this.layout, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.layout, this));
    this.layout();
    const restored = takeRestoredScroll(this, dpr);
    if (restored !== null) this.scroller.scrollTo(restored);
    fadeIn(this);
  }

  private settings(): Settings | null {
    return getSave(this)?.data.settings ?? null;
  }

  private change(apply: (s: Settings) => void): void {
    getSave(this)?.update((d) => apply(d.settings));
  }

  private layout(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    // A slider destroyed mid-drag (resize) never sends the release that re-enables scrolling.
    this.scroller.enabled = true;
    const scrolling = () => this.scroller.dragging;
    const { width, height } = this.scale.gameSize;
    const dpr = (this.registry.get("dpr") as number | undefined) ?? 1;
    const insets = (this.registry.get("insets") as { top: number; bottom: number } | undefined) ?? {
      top: 0,
      bottom: 0,
    };
    const px = (v: number) => Math.round(v * dpr);
    const frameW = Math.min(width, px(480));
    const left = (width - frameW) / 2 + px(20);
    const right = (width + frameW) / 2 - px(20);
    const s = this.settings();
    const text = (x: number, y: number, value: string, size: number, color: string = theme.text) =>
      this.add
        .text(x, y, value, { fontFamily: theme.font, fontSize: `${px(size)}px`, color })
        .setOrigin(0, 0.5);
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      return o;
    };

    // Top bar (fixed): back and title.
    const barH = insets.top + px(56);
    push(
      this.add
        .rectangle(0, 0, width, barH, theme.night, 0.96)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(10)
        .setInteractive(),
    );
    const touch = px(48);
    let backPressed = false;
    push(
      this.add
        .zone(left - px(16), insets.top + (px(56) - touch) / 2, touch, touch)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(11)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => (backPressed = true))
        .on("pointerout", () => (backPressed = false))
        .on("pointerup", () => backPressed && go(this, "levels")),
    );
    push(
      this.add
        .text(left - px(16) + touch / 2, insets.top + px(28), "‹", {
          fontFamily: theme.font,
          fontSize: `${px(34)}px`,
          color: theme.text,
        })
        .setOrigin(0.5, 0.55)
        .setScrollFactor(0)
        .setDepth(11),
    );
    push(
      this.add
        .text(width / 2, insets.top + px(28), "Settings", {
          fontFamily: theme.font,
          fontStyle: "bold",
          fontSize: `${px(18)}px`,
          color: theme.text,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(11),
    );

    let y = barH + px(24);
    const section = (title: string) => {
      push(text(left, y, title.toUpperCase(), 12, theme.textDim));
      y += px(30);
    };
    const toggleRow = (
      label: string,
      value: boolean,
      onChange: (v: boolean) => void,
      note = "",
    ) => {
      push(text(left, y, label, 16));
      if (note) push(text(left, y + px(20), note, 12, theme.textDim));
      const toggle = push(
        new Toggle(this, right - px(26), y + (note ? px(8) : 0), dpr, value, onChange, scrolling),
      );
      y += note ? px(64) : px(52);
      return toggle;
    };
    const sliderRow = (value: number, onChange: (v: number, done: boolean) => void) => {
      const slide = (v: number, done: boolean) => {
        // A horizontal drag on a slider must not also scroll the page.
        this.scroller.enabled = done;
        onChange(v, done);
      };
      push(new Slider(this, left + px(12), y, right - left - px(24), dpr, value, slide));
      y += px(48);
    };

    section("Sound");
    const soundToggle = toggleRow("Sound effects", s?.sound ?? true, (v) => {
      this.change((st) => (st.sound = v));
      if (v) getAudio(this).play("ui");
    });
    sliderRow(s?.sfxVolume ?? 0.8, (v, done) => {
      this.change((st) => {
        st.sfxVolume = v;
        if (v > 0) st.sound = true;
      });
      // Raising the volume turns sound on: keep the switch in step.
      if (v > 0) soundToggle.set(true);
      // A sample at the new level when the finger lifts.
      if (done) getAudio(this).play("collect", { chargeLeft: 3 });
    });
    const musicToggle = toggleRow("Music", s?.music ?? true, (v) =>
      this.change((st) => (st.music = v)),
    );
    sliderRow(s?.musicVolume ?? 0.5, (v) => {
      this.change((st) => {
        st.musicVolume = v;
        if (v > 0) st.music = true;
      });
      if (v > 0) musicToggle.set(true);
    });

    y += px(8);
    section("Comfort & accessibility");
    const canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
    toggleRow(
      "Vibration",
      s?.haptics ?? true,
      (v) => this.change((st) => (st.haptics = v)),
      canVibrate ? "" : "Not supported on this device",
    );
    toggleRow(
      "Color symbols",
      s?.colorblind ?? false,
      (v) => this.change((st) => (st.colorblind = v)),
      "A shape for each color on wisps and tiles",
    );
    // A preview of the shapes, so the option explains itself.
    const sym = px(18);
    for (let i = 0; i < 6; i++) {
      push(
        this.add
          .image(left + sym / 2 + i * (sym + px(10)), y - px(6), symbolTexture(this, i))
          .setDisplaySize(sym, sym)
          .setTint(theme.mist),
      );
    }
    y += px(30);
    push(text(left, y, "Reduce motion", 16));
    push(
      text(left, y + px(20), "Calmer effects: no particles, flashes or shakes", 12, theme.textDim),
    );
    y += px(66);
    push(
      new Segmented(
        this,
        (left + right) / 2,
        y,
        Math.min(px(110), (right - left) / 3),
        dpr,
        [
          { label: "Auto", value: "system" },
          { label: "On", value: "on" },
          { label: "Off", value: "off" },
        ],
        s?.reducedMotion ?? "system",
        (v) => this.change((st) => (st.reducedMotion = v as Settings["reducedMotion"])),
        scrolling,
      ),
    );
    y += px(56);

    // Only when analytics are configured at all; a browser privacy signal keeps them off.
    if (getAnalytics(this).name !== "none") {
      y += px(8);
      section("Privacy");
      if (privacySignal()) {
        push(text(left, y, "Anonymous play stats: off", 16));
        push(text(left, y + px(20), "Your browser asks sites not to track", 12, theme.textDim));
        y += px(56);
      } else {
        toggleRow(
          "Share anonymous play stats",
          readConsent() === "granted",
          (v) => writeConsent(v ? "granted" : "denied"),
          "Levels played and won; nothing personal",
        );
      }
    }

    y += px(8);
    section("Help");
    let replayPressed = false;
    const replay = push(
      this.add
        .text(left, y, "↺ Replay the tutorial", {
          fontFamily: theme.font,
          fontSize: `${px(16)}px`,
          color: theme.text,
          backgroundColor: "#2a1650",
          padding: { x: px(16), y: px(14) },
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => (replayPressed = true))
        .on("pointerout", () => (replayPressed = false))
        .on("pointerup", () => {
          if (!replayPressed || this.scroller.dragging) return;
          replayPressed = false;
          getSave(this)?.update((d) => (d.tips = []));
          getAudio(this).play("ui");
          replay.setText("✓ Tips will show again as you play");
        }),
    );
    y += px(64);

    this.scroller.setMax(y + insets.bottom - height);
  }
}
