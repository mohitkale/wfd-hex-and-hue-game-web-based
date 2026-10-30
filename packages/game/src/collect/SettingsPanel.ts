import type Phaser from "phaser";
import { getAnalytics, privacySignal, readConsent, writeConsent } from "../analytics";
import { getSave } from "../save";
import { defaultSave } from "../save/schema";
import { theme } from "../theme";
import { Button } from "../view/Button";
import { Segmented, Toggle } from "../view/controls";
import type { CollectLayout } from "./collectLayout";
import {
  MOTION_OPTIONS,
  TOGGLES,
  noteFor,
  withMotion,
  withToggle,
  type ToggleId,
} from "./settingsModel";

export interface PanelHandlers {
  /** A switch was saved (the scene applies what needs a redraw, e.g. colour symbols). */
  onChanged: (id: ToggleId, value: boolean) => void;
  onClose: () => void;
  /** Home: the level list (M15.13). */
  onHome?: () => void;
}

/**
 * The settings panel over the v2 board: sound, music, vibration, colour symbols, reduced motion and
 * (only when analytics exist) the anonymous-stats choice. It is an overlay, not a scene, so opening it
 * never costs the player their level. Everything it adds is returned, so the scene can remove it.
 */
export function buildSettingsPanel(
  scene: Phaser.Scene,
  l: CollectLayout,
  handlers: PanelHandlers,
): Phaser.GameObjects.GameObject[] {
  const dpr = l.dpr;
  const parts: Phaser.GameObjects.GameObject[] = [];
  const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    parts.push(o);
    return o;
  };
  const cx = l.frame.x + l.frame.w / 2;
  // A shade that also swallows taps, so nothing on the board moves underneath.
  push(
    scene.add
      .rectangle(cx, l.frame.y + l.frame.h / 2, l.frame.w, l.frame.h, 0x140b2e, 0.9)
      .setDepth(60)
      .setInteractive(),
  );
  const left = l.frame.x + 24 * dpr;
  const right = l.frame.x + l.frame.w - 24 * dpr;
  // Without a loaded save the rows show the defaults (and a change cannot be stored, so none is applied).
  const saved = getSave(scene);
  const settings = saved?.data.settings ?? defaultSave().settings;
  // A short frame (small phone, big insets) drops the grey notes and tightens the rows so Done never covers a control.
  const compact = l.frame.h < 640 * dpr;
  const change = (apply: (s: typeof settings) => typeof settings): boolean => {
    if (!saved) return false;
    saved.update((d) => {
      d.settings = apply(d.settings);
    });
    return true;
  };
  let y = l.frame.y + 40 * dpr;
  push(
    scene.add
      .text(cx, y, "Settings", {
        fontFamily: theme.font,
        fontStyle: "bold",
        fontSize: `${Math.round(22 * dpr)}px`,
        color: theme.text,
      })
      .setOrigin(0.5)
      .setDepth(61),
  );
  y += 44 * dpr;
  const label = (text: string, yy: number, size: number, color: string) =>
    push(
      scene.add
        .text(left, yy, text, {
          fontFamily: theme.font,
          fontSize: `${Math.round(size * dpr)}px`,
          color,
        })
        .setOrigin(0, 0.5)
        .setDepth(61),
    );
  const canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  const row = (text: string, note: string, value: boolean, onChange: (v: boolean) => void) => {
    label(text, y, 16, theme.text);
    if (note && !compact) label(note, y + 20 * dpr, 11, theme.textDim);
    const toggle = push(
      new Toggle(scene, right - 26 * dpr, y + (note ? 8 * dpr : 0), dpr, value, onChange),
    );
    toggle.setDepth(61);
    y += (note && !compact ? 62 : compact ? 44 : 50) * dpr;
  };
  for (const t of TOGGLES) {
    row(t.label, noteFor(t, canVibrate), settings[t.id], (v) => {
      if (change((s) => withToggle(s, t.id, v))) handlers.onChanged(t.id, v);
    });
  }
  label("Reduce motion", y, 16, theme.text);
  if (!compact)
    label("Calmer effects: no particles, flashes or shakes", y + 20 * dpr, 11, theme.textDim);
  y += (compact ? 44 : 56) * dpr;
  const segment = push(
    new Segmented(
      scene,
      cx,
      y,
      Math.min(110 * dpr, (right - left) / 3),
      dpr,
      MOTION_OPTIONS,
      settings.reducedMotion,
      // The saved change reaches the scene through the registry's `reducedMotion` flag, which redraws it.
      (v) => void change((s) => withMotion(s, v)),
    ),
  );
  segment.setDepth(61);
  y += 50 * dpr;
  // The anonymous-stats choice, only where analytics exist; a browser privacy signal keeps it off.
  if (getAnalytics(scene).name !== "none") {
    if (privacySignal()) {
      label("Anonymous play stats: off (your browser asks not to track)", y, 12, theme.textDim);
      y += 40 * dpr;
    } else {
      row(
        "Share anonymous play stats",
        "Levels played and won; nothing personal",
        readConsent() === "granted",
        (v) => writeConsent(v ? "granted" : "denied"),
      );
    }
  }
  const done = new Button(
    scene,
    cx,
    Math.min(y + 24 * dpr, l.frame.y + l.frame.h - 40 * dpr),
    Math.min(l.frame.w * 0.6, 220 * dpr),
    "Done",
    {
      dpr,
      primary: true,
      onPress: handlers.onClose,
    },
  ).setDepth(61);
  scene.add.existing(done);
  push(done);
  if (handlers.onHome) {
    const home = new Button(
      scene,
      cx,
      done.y + 56 * dpr,
      Math.min(l.frame.w * 0.6, 220 * dpr),
      "Levels",
      { dpr, onPress: handlers.onHome },
    ).setDepth(61);
    scene.add.existing(home);
    push(home);
  }
  return parts;
}
