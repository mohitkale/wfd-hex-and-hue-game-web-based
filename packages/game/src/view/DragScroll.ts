import type Phaser from "phaser";

/**
 * Vertical scrolling for a scene's main camera: one-finger drag (or mouse drag) and the wheel.
 * A drag past a small threshold marks the gesture as a scroll so taps on content can ignore it.
 */
export class DragScroll {
  /** True once the current gesture has moved far enough to be a scroll, not a tap. */
  dragging = false;
  /** Set false while a modal (e.g. a Spellbook page) is open: the content underneath stays put. */
  enabled = true;
  private max = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    dpr: number,
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
      if (!p.isDown || p.id !== active || !this.enabled) return;
      const dy = p.y - startY;
      if (Math.abs(dy) > 10 * dpr) this.dragging = true;
      if (this.dragging) this.scrollTo(startScroll - dy);
    });
    input.on("wheel", (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.enabled) this.scrollTo(scene.cameras.main.scrollY + dy * dpr);
    });
  }

  /** Content height beyond the viewport. */
  setMax(max: number): void {
    this.max = Math.max(0, max);
    this.scrollTo(this.scene.cameras.main.scrollY);
  }

  scrollTo(y: number): void {
    this.scene.cameras.main.setScroll(0, Math.max(0, Math.min(this.max, y)));
  }
}

/**
 * The scroll position (in device pixels) a scene was restarted with after a pixel-ratio change
 * (`{ scrollCss }`, see index.ts), or `null`. Cleared once read: Phaser keeps start data around
 * for later starts that pass none.
 */
export function takeRestoredScroll(scene: Phaser.Scene, dpr: number): number | null {
  const data = scene.sys.settings.data as { scrollCss?: unknown } | undefined;
  const css = data?.scrollCss;
  scene.sys.settings.data = {};
  return typeof css === "number" && Number.isFinite(css) ? css * dpr : null;
}
