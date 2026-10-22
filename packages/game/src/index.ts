import Phaser from "phaser";
import type { Insets } from "./layout";
import { BootScene } from "./scenes/BootScene";
import { SpellbookScene } from "./scenes/SpellbookScene";
import { WorldMapScene } from "./scenes/WorldMapScene";
import { PlayScene } from "./scenes/PlayScene";
import { AudioEngine, audioSettings } from "./audio";
import { createRewards } from "./rewards";
import { loadSave } from "./save";
import { defaultSave } from "./save/schema";
import { theme } from "./theme";

/** Reads the CSS safe-area insets (notch, home indicator) in device pixels. */
function readInsets(dpr: number): Insets {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) " +
    "env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = {
    top: parseFloat(cs.paddingTop) * dpr,
    right: parseFloat(cs.paddingRight) * dpr,
    bottom: parseFloat(cs.paddingBottom) * dpr,
    left: parseFloat(cs.paddingLeft) * dpr,
  };
  probe.remove();
  return insets;
}

/**
 * Mounts the game into `parent`, filling it. The canvas is rendered at device resolution (capped
 * at 3×) and shown at CSS size, so pixels and text stay crisp on high-DPI phones. Scenes work in
 * device pixels and read `dpr` and safe-area `insets` from the registry.
 */
export function mountGame(parent: HTMLElement): Phaser.Game {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const size = () => ({
    w: Math.max(1, Math.round(parent.clientWidth * dpr)),
    h: Math.max(1, Math.round(parent.clientHeight * dpr)),
  });
  const { w, h } = size();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: theme.night,
    width: w,
    height: h,
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
    input: { activePointers: 2 },
    disableContextMenu: true,
    scene: [BootScene, WorldMapScene, SpellbookScene, PlayScene],
  });
  game.registry.set("dpr", dpr);
  game.registry.set("insets", readInsets(dpr));
  // Audio stays silent until the first tap or key (browser rule), then follows the saved settings.
  const audio = new AudioEngine(audioSettings(defaultSave().settings));
  game.registry.set("audio", audio);
  const unlock = () => audio.unlock();
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
  const onVisibility = () => audio.setHidden(document.visibilityState === "hidden");
  document.addEventListener("visibilitychange", onVisibility);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    window.removeEventListener("pointerdown", unlock, { capture: true });
    window.removeEventListener("keydown", unlock, { capture: true });
    document.removeEventListener("visibilitychange", onVisibility);
  });
  void loadSave(game).then((save) => {
    audio.configure(audioSettings(save.data.settings));
    save.subscribe((d) => audio.configure(audioSettings(d.settings)));
  });
  game.registry.set(
    "rewards",
    createRewards({ PUBLIC_REWARDS: import.meta.env?.PUBLIC_REWARDS, DEV: import.meta.env?.DEV }),
  );

  // Coalesce bursts (address-bar show/hide, drag-resize, rotation) into one resize per frame and
  // skip no-op ones.
  let pending = 0;
  const onResize = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const next = size();
      const insets = readInsets(dpr);
      const prev = game.registry.get("insets") as Insets;
      const insetsChanged = JSON.stringify(insets) !== JSON.stringify(prev);
      if (next.w === game.scale.width && next.h === game.scale.height && !insetsChanged) return;
      game.registry.set("insets", insets);
      game.scale.resize(next.w, next.h);
    });
  };
  window.addEventListener("resize", onResize);
  // Dev-only handle for debugging and browser-driven checks.
  if (import.meta.env?.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game;
  game.events.once(Phaser.Core.Events.DESTROY, () =>
    window.removeEventListener("resize", onResize),
  );
  return game;
}
