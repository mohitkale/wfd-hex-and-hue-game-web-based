import type Phaser from "phaser";
import { theme } from "../theme";

/** Each half of a scene change. Short: a transition should never feel like a loading screen. */
export const FADE_MS = 150;

const NIGHT = [(theme.night >> 16) & 255, (theme.night >> 8) & 255, theme.night & 255] as const;

/** `Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE`, without importing Phaser at runtime. */
const FADE_OUT_COMPLETE = "camerafadeoutcomplete";

/** Scenes currently fading out; a second tap during the fade must not start another change. */
const leaving = new WeakSet<Phaser.Scene>();

/** True while the scene fades out: it should stop simulating and ignore all input. */
export function isLeaving(scene: Phaser.Scene): boolean {
  return leaving.has(scene);
}

/** Fades the scene in from the night sky. Call at the end of `create`. */
export function fadeIn(scene: Phaser.Scene): void {
  leaving.delete(scene);
  scene.input.enabled = true;
  if (scene.input.keyboard) scene.input.keyboard.enabled = true;
  scene.cameras.main.fadeFrom(FADE_MS, ...NIGHT, true);
}

/**
 * Fades to the night sky, then starts scene `key` (which may be this scene: a restart). Pointer
 * and keyboard input are off while fading, so nothing behind the fade can be tapped.
 */
export function go(scene: Phaser.Scene, key: string, data?: object): void {
  if (leaving.has(scene)) return;
  leaving.add(scene);
  scene.input.enabled = false;
  if (scene.input.keyboard) scene.input.keyboard.enabled = false;
  const camera = scene.cameras.main;
  camera.once(FADE_OUT_COMPLETE, () => {
    scene.scene.start(key, data);
  });
  // Forced, so a change requested while the scene is still fading in isn't dropped.
  camera.fade(FADE_MS, ...NIGHT, true);
}
