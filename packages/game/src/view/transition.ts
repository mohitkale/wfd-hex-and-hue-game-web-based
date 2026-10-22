import Phaser from "phaser";
import { theme } from "../theme";

/** Each half of a scene change. Short: a transition should never feel like a loading screen. */
export const FADE_MS = 150;

const NIGHT = [(theme.night >> 16) & 255, (theme.night >> 8) & 255, theme.night & 255] as const;

/** Scenes currently fading out; a second tap during the fade must not start another change. */
const leaving = new WeakSet<Phaser.Scene>();

/** Fades the scene in from the night sky. Call at the end of `create`. */
export function fadeIn(scene: Phaser.Scene): void {
  leaving.delete(scene);
  scene.input.enabled = true;
  scene.cameras.main.fadeFrom(FADE_MS, ...NIGHT, true);
}

/**
 * Fades to the night sky, then starts scene `key` (which may be this scene: a restart). Input is
 * off while fading, so nothing behind the fade can be tapped.
 */
export function go(scene: Phaser.Scene, key: string, data?: object): void {
  if (leaving.has(scene)) return;
  leaving.add(scene);
  scene.input.enabled = false;
  const camera = scene.cameras.main;
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    scene.scene.start(key, data);
  });
  // Forced, so a change requested while the scene is still fading in isn't dropped.
  camera.fade(FADE_MS, ...NIGHT, true);
}
