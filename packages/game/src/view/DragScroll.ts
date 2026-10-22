import type Phaser from "phaser";

/**
 * Vertical scrolling for a scene's main camera: one-finger drag (or mouse drag) and the wheel.
 * A drag past a small threshold marks the gesture as a scroll so taps on content can ignore it.
 */
export class DragScroll {
  /** True once the current gesture has moved far enough to be a scroll, not a tap. */
  dragging = false;
  private max = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    dpr: number,
    private readonly onScroll: (y: number) => void = () => {},
  ) {
    let startY = 0;
    let startScroll = 0;
    let active = -1;
    const input = scene.input;
    input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (active !== -1 && active !== p.id) return;
      active = p.id;
      startY = p.y;
      startScroll = scene.cameras.main.scrollY;
      this.dragging = false;
    });
    input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.id === active) active = -1;
    });
    input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown || p.id !== active) return;
      const dy = p.y - startY;
      if (Math.abs(dy) > 10 * dpr) this.dragging = true;
      if (this.dragging) this.scrollTo(startScroll - dy);
    });
    input.on("wheel", (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) =>
      this.scrollTo(scene.cameras.main.scrollY + dy * dpr),
    );
  }

  /** Content height beyond the viewport. */
  setMax(max: number): void {
    this.max = Math.max(0, max);
    this.scrollTo(this.scene.cameras.main.scrollY);
  }

  scrollTo(y: number): void {
    const clamped = Math.max(0, Math.min(this.max, y));
    this.scene.cameras.main.setScroll(0, clamped);
    this.onScroll(clamped);
  }
}
