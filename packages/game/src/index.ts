import Phaser from "phaser";
import type { Insets } from "./layout";
import { BootScene } from "./scenes/BootScene";
import { SpellbookScene } from "./scenes/SpellbookScene";
import { WorldMapScene } from "./scenes/WorldMapScene";
import { PlayScene } from "./scenes/PlayScene";
import { SettingsScene } from "./scenes/SettingsScene";
import { AudioEngine, audioSettings } from "./audio";
import { reducedMotion } from "./a11y";
import { nextRenderDpr, renderDpr } from "./display";
import { CONSENT_EVENT, createAnalytics, readConsent, safeFlush, track } from "./analytics";
import { createRewards } from "./rewards";
import { loadSave } from "./save";
import { defaultSave } from "./save/schema";
import { v2Requested } from "./collect/engineFlag";
import { theme } from "./theme";

/** MediaQueryList change listeners (Safari before 14 only has the old addListener API). */
function listen(q: MediaQueryList | null, fn: () => void): void {
  if (q?.addEventListener) q.addEventListener("change", fn);
  else q?.addListener?.(fn);
}

function unlisten(q: MediaQueryList | null, fn: () => void): void {
  if (q?.removeEventListener) q.removeEventListener("change", fn);
  else q?.removeListener?.(fn);
}

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
 * Mounts the game into `parent`, filling it. The canvas is rendered at device resolution (see
 * `renderDpr`: capped at 3×, and lowered on huge desktop windows) and shown at CSS size, so pixels
 * and text stay crisp on high-DPI phones. Scenes work in device pixels and read `dpr` and
 * safe-area `insets` from the registry; when the ratio changes (window moved to another screen,
 * browser zoom, a much bigger window), the game re-renders at the new one.
 */
export function mountGame(parent: HTMLElement): Phaser.Game {
  let dpr = renderDpr(window.devicePixelRatio, parent.clientWidth, parent.clientHeight);
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
    // All sound comes from our own Web Audio engine; Phaser's would be a second, unused context.
    audio: { noAudio: true },
    disableContextMenu: true,
    scene: [BootScene, WorldMapScene, SpellbookScene, SettingsScene, PlayScene],
  });
  game.registry.set("dpr", dpr);
  game.registry.set("insets", readInsets(dpr));
  // The v2 board (`?engine=v2`, review builds only) is a separate chunk, loaded only when asked for;
  // without the flag nothing of it is requested and the game below is exactly the shipped one.
  if (v2Requested(window.location.search, import.meta.env?.PUBLIC_ENGINE)) {
    void import("./collect/CollectScene")
      .then(({ CollectScene }) => {
        const start = () => {
          game.scene.stop("boot");
          game.scene.add("collect", CollectScene, true);
        };
        // The scene manager boots on READY (after the game object reports `isBooted`): adding a
        // scene earlier would start it alongside the title screen.
        if (game.scene.isBooted) start();
        else game.events.once(Phaser.Core.Events.READY, start);
      })
      .catch((error: unknown) => {
        // Offline, or a stale/removed review chunk: stay on the title screen and say why.
        console.error("The v2 board could not be loaded (review build only).", error);
      });
  }
  // Audio stays silent until the first tap or key (browser rule), then follows the saved settings.
  const audio = new AudioEngine(audioSettings(defaultSave().settings));
  game.registry.set("audio", audio);
  // Several gesture types, because browsers differ on which ones may start audio (iOS prefers
  // touchend / pointerup).
  const unlock = () => audio.unlock();
  const gestures = ["pointerdown", "pointerup", "touchend", "keydown"] as const;
  for (const g of gestures) window.addEventListener(g, unlock, { capture: true });
  const onVisibility = () => audio.setHidden(document.visibilityState === "hidden");
  document.addEventListener("visibilitychange", onVisibility);
  let unsubscribe = () => {};
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    for (const g of gestures) window.removeEventListener(g, unlock, { capture: true });
    document.removeEventListener("visibilitychange", onVisibility);
    unsubscribe();
    unlisten(motionQuery, applyMotion);
    audio.dispose();
  });
  // Reduced motion: the player's setting, or the OS preference on "system". Scenes read the
  // "reducedMotion" registry flag when they play effects.
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
  let motionSetting: "system" | "on" | "off" = "system";
  const applyMotion = () =>
    game.registry.set("reducedMotion", reducedMotion(motionSetting, !!motionQuery?.matches));
  applyMotion();
  listen(motionQuery, applyMotion);
  void loadSave(game).then((save) => {
    audio.configure(audioSettings(save.data.settings));
    motionSetting = save.data.settings.reducedMotion;
    applyMotion();
    const off = save.subscribe((d) => {
      audio.configure(audioSettings(d.settings));
      motionSetting = d.settings.reducedMotion;
      applyMotion();
    });
    unsubscribe = () => void off();
  });
  // Analytics: only with a configured key, and only once the player has agreed (see analytics/).
  const analytics = createAnalytics({
    PUBLIC_POSTHOG_KEY: import.meta.env?.PUBLIC_POSTHOG_KEY,
    PUBLIC_POSTHOG_HOST: import.meta.env?.PUBLIC_POSTHOG_HOST,
  });
  game.registry.set("analytics", analytics);
  const appOpen = () =>
    track(game, "app_open", {
      standalone: window.matchMedia?.("(display-mode: standalone)").matches ?? false,
    });
  appOpen();
  // A first-time player answers the consent banner after the game opened: count this session's
  // open once they agree (it was dropped while consent was unknown).
  let opened = readConsent() === "granted";
  const onConsent = () => {
    if (!opened && readConsent() === "granted") {
      opened = true;
      appOpen();
    }
  };
  window.addEventListener(CONSENT_EVENT, onConsent);
  const flushAnalytics = () => safeFlush(analytics, document.visibilityState === "hidden");
  const analyticsTimer = window.setInterval(flushAnalytics, 30_000);
  document.addEventListener("visibilitychange", flushAnalytics);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    window.clearInterval(analyticsTimer);
    document.removeEventListener("visibilitychange", flushAnalytics);
    window.removeEventListener(CONSENT_EVENT, onConsent);
    safeFlush(analytics, true);
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
      if (window.devicePixelRatio !== watchedRatio) watchDpr();
      const nextDpr = nextRenderDpr(
        dpr,
        window.devicePixelRatio,
        parent.clientWidth,
        parent.clientHeight,
      );
      if (nextDpr !== dpr) {
        const oldDpr = dpr;
        dpr = nextDpr;
        game.registry.set("dpr", dpr);
        game.registry.set("insets", readInsets(dpr));
        game.scale.setZoom(1 / dpr);
        const s = size();
        game.scale.resize(s.w, s.h);
        // Menus size everything (scrolling included) at create time: rebuild them. The play
        // scene re-lays itself out from the registry on resize, keeping the board in progress.
        for (const scene of game.scene.getScenes(true)) {
          if (scene.scene.key === "play" || scene.scene.key === "collect") continue;
          // Keep the scroll position (in CSS pixels, so it survives the ratio change).
          scene.scene.restart({ scrollCss: scene.cameras.main.scrollY / oldDpr });
        }
        return;
      }
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
  // A device-ratio change without a resize (window dragged to another screen, browser zoom on
  // some platforms) fires this media query instead; re-armed for each new ratio.
  let dprQuery: MediaQueryList | null = null;
  let watchedRatio = 0;
  const watchDpr = () => {
    unlisten(dprQuery, onResize);
    watchedRatio = window.devicePixelRatio;
    dprQuery = window.matchMedia?.(`(resolution: ${watchedRatio}dppx)`) ?? null;
    listen(dprQuery, onResize);
  };
  watchDpr();
  // Dev-only handle for debugging and browser-driven checks.
  if (import.meta.env?.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game;
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    window.removeEventListener("resize", onResize);
    unlisten(dprQuery, onResize);
  });
  return game;
}
