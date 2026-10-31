import type Phaser from "phaser";

/** How long the screen must stay still before drawing stops, in ms. */
export const IDLE_AFTER_MS = 600;

/**
 * Stops drawing while nothing on screen moves (M15.13). Phaser redraws the whole canvas every frame
 * even when the board is still, which kept integrated GPUs busy (and laptops hot) while the player was
 * only thinking. Once `busy()` has been false (and no camera effect, such as the fade a scene opens with,
 * is playing) for `IDLE_AFTER_MS` the game loop sleeps; any pointer,
 * key, resize or visibility change wakes it at once, and `wake()` lets code that starts something
 * asynchronously (an ad result) wake it too. Call `frame(now)` from the scene's `update`.
 */
export class IdleLoop {
  private quietSince = -1;
  private sleepPending = false;
  private readonly wakeUp = () => this.wake();

  constructor(
    private readonly game: Phaser.Game,
    private readonly busy: () => boolean,
  ) {
    const canvas = game.canvas;
    for (const type of ["pointerdown", "pointermove", "wheel", "touchstart"] as const)
      canvas.addEventListener(type, this.wakeUp, { passive: true });
    window.addEventListener("keydown", this.wakeUp);
    window.addEventListener("resize", this.wakeUp);
    document.addEventListener("visibilitychange", this.wakeUp);
  }

  /** Called every frame: counts quiet time and puts the loop to sleep once it has been still long enough. */
  frame(now: number): void {
    if (this.busy() || this.cameraBusy()) {
      this.quietSince = -1;
      return;
    }
    if (this.quietSince < 0) this.quietSince = now;
    else if (now - this.quietSince >= IDLE_AFTER_MS && !this.sleepPending) {
      // Sleep only once this frame has been drawn: with a frame-rate cap, stopping in `update` could
      // leave an older frame (the fade-in's dark one) on screen.
      this.sleepPending = true;
      this.game.events.once("postrender", () => {
        this.sleepPending = false;
        if (this.quietSince >= 0) this.game.loop.sleep();
        this.quietSince = -1;
      });
    }
  }

  /** A camera effect (the fade a scene opens with) is still playing in some running scene. */
  private cameraBusy(): boolean {
    for (const scene of this.game.scene.getScenes(true)) {
      const cam = scene.cameras?.main;
      if (
        cam &&
        (cam.fadeEffect.isRunning || cam.flashEffect.isRunning || cam.shakeEffect.isRunning)
      )
        return true;
    }
    return false;
  }

  wake(): void {
    this.quietSince = -1;
    if (!this.game.loop.running) this.game.loop.wake(true);
  }

  /** Removes the listeners and leaves the loop running (the next scene manages its own). */
  destroy(): void {
    const canvas = this.game.canvas;
    for (const type of ["pointerdown", "pointermove", "wheel", "touchstart"] as const)
      canvas.removeEventListener(type, this.wakeUp);
    window.removeEventListener("keydown", this.wakeUp);
    window.removeEventListener("resize", this.wakeUp);
    document.removeEventListener("visibilitychange", this.wakeUp);
    this.wake();
  }
}
