import type Phaser from "phaser";
import { SaveManager } from "./manager";
import { createStore } from "./store";

export { SaveManager } from "./manager";
export { BOOSTERS, type BoosterKind, type SaveData } from "./schema";

const KEY = "save";

/** The loaded save, or `undefined` while it is still loading. */
export function getSave(scene: Phaser.Scene): SaveManager | undefined {
  return scene.registry.get(KEY) as SaveManager | undefined;
}

/** Runs `then` once the save is loaded (immediately if it already is). */
export function whenSaveReady(scene: Phaser.Scene, then: (save: SaveManager) => void): void {
  const ready = getSave(scene);
  if (ready) return then(ready);
  const onSet = (_parent: unknown, key: string, value: unknown) => {
    if (key !== KEY) return;
    scene.registry.events.off("setdata", onSet);
    then(value as SaveManager);
  };
  scene.registry.events.on("setdata", onSet);
}

/**
 * Loads the save into the game registry and makes sure it reaches storage when the page goes away
 * (mobile browsers may kill a backgrounded tab without warning).
 */
export async function loadSave(game: Phaser.Game): Promise<SaveManager> {
  const save = await SaveManager.load(await createStore());
  game.registry.set(KEY, save);
  const flush = () => void save.flush();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
  return save;
}

/** 3★ for a clean win, 2★ with one or two assists (undo, boosters), 1★ beyond that. */
export function starsFor(assists: number): number {
  return assists === 0 ? 3 : assists <= 2 ? 2 : 1;
}
