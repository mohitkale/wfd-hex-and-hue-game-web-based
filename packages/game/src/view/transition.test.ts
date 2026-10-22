import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { fadeIn, go, isLeaving } from "./transition";

/** Just enough of a scene for transitions: input flags, a camera with fades, a scene plugin. */
function fakeScene() {
  const listeners = new Map<string, () => void>();
  const scene = {
    input: { enabled: true, keyboard: { enabled: true } },
    cameras: {
      main: {
        once: (event: string, fn: () => void) => listeners.set(event, fn),
        fade: vi.fn(),
        fadeFrom: vi.fn(),
      },
    },
    scene: { start: vi.fn() },
    finishFade: () => listeners.get("camerafadeoutcomplete")?.(),
  };
  return scene;
}
const asScene = (s: ReturnType<typeof fakeScene>) => s as unknown as Phaser.Scene;

describe("scene transitions", () => {
  it("disables pointer and keyboard input while fading out, then starts the scene", () => {
    const s = fakeScene();
    go(asScene(s), "play", { world: 0, level: 1 });
    expect(isLeaving(asScene(s))).toBe(true);
    expect(s.input.enabled).toBe(false);
    expect(s.input.keyboard.enabled).toBe(false);
    expect(s.scene.start).not.toHaveBeenCalled();
    s.finishFade();
    expect(s.scene.start).toHaveBeenCalledWith("play", { world: 0, level: 1 });
  });

  it("ignores a second change requested during the fade", () => {
    const s = fakeScene();
    go(asScene(s), "levels");
    go(asScene(s), "spellbook");
    expect(s.cameras.main.fade).toHaveBeenCalledTimes(1);
    s.finishFade();
    expect(s.scene.start).toHaveBeenCalledTimes(1);
    expect(s.scene.start).toHaveBeenCalledWith("levels", undefined);
  });

  it("fading in (a scene's create) restores input and allows the next change", () => {
    const s = fakeScene();
    go(asScene(s), "play");
    s.finishFade();
    fadeIn(asScene(s));
    expect(isLeaving(asScene(s))).toBe(false);
    expect(s.input.enabled).toBe(true);
    expect(s.input.keyboard.enabled).toBe(true);
    go(asScene(s), "levels");
    expect(s.cameras.main.fade).toHaveBeenCalledTimes(2);
  });
});
