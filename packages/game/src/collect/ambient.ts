import type Phaser from "phaser";
import { unit } from "./swarm";

export interface Mote {
  /** Fractions of the frame, 0..1. */
  x: number;
  y: number;
  /** 0..1 twinkle. */
  glow: number;
}

/** How many motes drift behind the board. */
export const MOTES = 14;

/** Seconds for a mote to rise from the bottom of the frame to the top. */
const RISE_SECONDS = 38;

/**
 * Where mote `i` is at `timeMs`: a slow rise with a small sideways sway, wrapping at the top, and a
 * gentle twinkle. A pure function of the index and the time, so it is deterministic and costs
 * nothing to place. With `still` the mote keeps its start position and steady glow (reduced motion).
 */
export function moteAt(i: number, timeMs: number, still: boolean, out: Mote = newMote()): Mote {
  const baseX = unit(i, 10);
  const baseY = unit(i, 11);
  const rate = 0.6 + unit(i, 12) * 0.8;
  const t = still ? 0 : timeMs / 1000;
  const rise = (baseY - (t * rate) / RISE_SECONDS) % 1;
  out.y = rise < 0 ? rise + 1 : rise;
  out.x = baseX + (still ? 0 : Math.sin(t * 0.35 * rate + unit(i, 13) * 6.28) * 0.02);
  out.glow = still ? 0.6 : 0.5 + 0.5 * Math.sin(t * 0.9 * rate + unit(i, 14) * 6.28);
  return out;
}

export const newMote = (): Mote => ({ x: 0, y: 0, glow: 0 });

/** The faint motes behind the board: a few soft lights that make the dark feel alive. */
export class AmbientLayer {
  private readonly images: Phaser.GameObjects.Image[];
  private readonly scratch = newMote();

  constructor(
    scene: Phaser.Scene,
    private readonly frame: { x: number; y: number; w: number; h: number },
    texture: string,
    private still: boolean,
    cellPx: number,
  ) {
    this.images = Array.from({ length: MOTES }, (_, i) => {
      const size = cellPx * (0.5 + unit(i, 15) * 0.7);
      return scene.add
        .image(0, 0, texture)
        .setTint(i % 3 === 0 ? 0xf6d97a : 0xb48cff)
        .setDisplaySize(size, size)
        .setDepth(0.1);
    });
    this.update(0);
  }

  setStill(still: boolean): void {
    this.still = still;
  }

  update(timeMs: number): void {
    const f = this.frame;
    for (let i = 0; i < this.images.length; i++) {
      const m = moteAt(i, timeMs, this.still, this.scratch);
      this.images[i]!.setPosition(f.x + m.x * f.w, f.y + m.y * f.h).setAlpha(0.06 + m.glow * 0.16);
    }
  }
}
