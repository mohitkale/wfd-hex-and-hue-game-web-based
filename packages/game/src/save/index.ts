import type Phaser from "phaser";
import { SaveManager } from "./manager";
import { MemoryStore, createStore } from "./store";

export { SaveManager } from "./manager";
export { BOOSTERS, type BoosterKind, type SaveData } from "./schema";

const KEY = "save";

/** The loaded save, or `undefined` while it is still loading. */
export function getSave(scene: Phaser.Scene): SaveManager | undefined {
  return scene.registry.get(KEY) as SaveManager | undefined;
}

/**
 * Runs `then` once the save is loaded (immediately if it already is). If loading takes longer than
 * `timeoutMs`, runs it anyway with `undefined`: storage trouble must never block play.
 */
export function whenSaveReady(
  scene: Phaser.Scene,
  then: (save: SaveManager | undefined) => void,
  timeoutMs = 2500,
): void {
  const ready = getSave(scene);
  if (ready) return then(ready);
  let done = false;
  const finish = (save: SaveManager | undefined) => {
    if (done) return;
    done = true;
    scene.registry.events.off("setdata", onSet);
    clearTimeout(timer);
    then(save);
  };
  const onSet = (_parent: unknown, key: string, value: unknown) => {
    if (key === KEY) finish(value as SaveManager);
  };
  const timer = setTimeout(() => finish(getSave(scene)), timeoutMs);
  scene.registry.events.on("setdata", onSet);
}

/**
 * Loads the save into the game registry and makes sure it reaches storage when the page goes away
 * (mobile browsers may kill a backgrounded tab without warning). Never rejects: on any failure the
 * game gets an in-memory save.
 */
export async function loadSave(game: Phaser.Game): Promise<SaveManager> {
  let save: SaveManager;
  try {
    save = await SaveManager.load(await createStore());
  } catch {
    save = SaveManager.inMemory(new MemoryStore());
  }
  game.registry.set(KEY, save);
  const flush = () => void save.flush();
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", flush);
  game.events.once("destroy", () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", flush);
  });
  return save;
}

export { starsFor } from "./stars";
