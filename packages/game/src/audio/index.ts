import type Phaser from "phaser";
import type { SaveData } from "../save/schema";
import { AudioEngine, type AudioSettings } from "./engine";

export { AudioEngine, type AudioLike, type AudioSettings } from "./engine";
export type { SoundName } from "./sounds";

export const audioSettings = (s: SaveData["settings"]): AudioSettings => ({
  sound: s.sound,
  music: s.music,
  sfxVolume: s.sfxVolume,
  musicVolume: s.musicVolume,
});

/** The game's audio engine; a silent stand-in if none is registered. */
export function getAudio(scene: Phaser.Scene): AudioEngine {
  return (
    (scene.registry.get("audio") as AudioEngine | undefined) ??
    new AudioEngine({ sound: false, music: false, sfxVolume: 0, musicVolume: 0 }, () => null)
  );
}
