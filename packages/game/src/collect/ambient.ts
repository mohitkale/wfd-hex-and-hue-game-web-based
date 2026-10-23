import type Phaser from "phaser";
import { unit } from "./swarm";

export interface Mote {
  /** Fractions of the frame, 0..1. */
  x: number;
  y: number;
  /** 0..1 twinkle. */
  glow: number;
}

import type { Atmosphere } from "./worldIdentity";

/** How many motes drift behind the board by default (Moonlit). */
export const MOTES = 14;

/** Seconds for a mote to rise from the bottom of the frame to the top. */
const RISE_SECONDS = 38;

/** The original gentle rise (Moonlit): the default when no atmosphere is given. */
const DEFAULT_MOTION: Pick<Atmosphere, "motion" | "speed" | "twinkle"> = {
  motion: "rise",
  speed: 1,
  twinkle: 1,
};

/**
 * Where mote `i` is at `timeMs` for an atmosphere's motion, always inside the frame (0..1): `rise`
 * floats up with a small sway and wraps at the top, `twinkle` stays where it is, `orbit` circles
 * slowly around its home. The glow is a gentle pulse of depth `twinkle`. A pure function of the index
 * and the time, so it is deterministic and costs nothing to place. With `still` the mote keeps its
 * start position and steady glow (reduced motion).
 */
export function moteAt(
  i: number,
  timeMs: number,
  still: boolean,
  out: Mote = newMote(),
  a: Pick<Atmosphere, "motion" | "speed" | "twinkle"> = DEFAULT_MOTION,
): Mote {
  const baseX = unit(i, 10);
  const baseY = unit(i, 11);
  const rate = (0.6 + unit(i, 12) * 0.8) * a.speed;
  const t = still ? 0 : timeMs / 1000;
  const phase = unit(i, 14) * 6.28;
  const pulse = Math.sin(t * 0.9 * rate + phase);
  switch (a.motion) {
    case "twinkle":
      out.x = baseX;
      out.y = baseY;
      break;
    case "orbit": {
      const angle = t * 0.12 * rate + unit(i, 13) * 6.28;
      const radius = 0.015 + unit(i, 12) * 0.03;
      out.x = clamp01(baseX + Math.cos(angle) * radius);
      out.y = clamp01(baseY + Math.sin(angle) * radius);
      break;
    }
    default: {
      const rise = (baseY - (t * rate) / RISE_SECONDS) % 1;
      out.y = rise < 0 ? rise + 1 : rise;
      out.x = baseX + (still ? 0 : Math.sin(t * 0.35 * rate + unit(i, 13) * 6.28) * 0.02);
    }
  }
  out.glow = still ? 0.6 : 1 - a.twinkle / 2 + (a.twinkle / 2) * pulse;
  return out;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export const newMote = (): Mote => ({ x: 0, y: 0, glow: 0 });

/** The faint lights behind the board: they make the dark feel alive, and each world's behave differently. */
export class AmbientLayer {
  private readonly images: Phaser.GameObjects.Image[];
  private readonly scratch = newMote();
  private placed = false;
  private readonly look: Atmosphere | null;

  constructor(
    scene: Phaser.Scene,
    private readonly frame: { x: number; y: number; w: number; h: number },
    texture: string,
    private readonly still: boolean,
    cellPx: number,
    atmosphere?: Atmosphere,
  ) {
    this.look = atmosphere ?? null;
    const count = atmosphere?.count ?? MOTES;
    this.images = Array.from({ length: count }, (_, i) => {
      const size =
        cellPx * ((atmosphere?.size.min ?? 0.5) + unit(i, 15) * (atmosphere?.size.spread ?? 0.7));
      const tint = atmosphere
        ? atmosphere.tints[i % atmosphere.tints.length]!
        : i % 3 === 0
          ? 0xf6d97a
          : 0xb48cff;
      return scene.add.image(0, 0, texture).setTint(tint).setDisplaySize(size, size).setDepth(0.1);
    });
    this.update(0);
  }

  update(timeMs: number): void {
    if (this.still && this.placed) return;
    this.placed = true;
    const f = this.frame;
    const peak = this.look?.brightness ?? 0.16;
    for (let i = 0; i < this.images.length; i++) {
      const m = moteAt(i, timeMs, this.still, this.scratch, this.look ?? DEFAULT_MOTION);
      this.images[i]!.setPosition(f.x + m.x * f.w, f.y + m.y * f.h).setAlpha(0.06 + m.glow * peak);
    }
  }
}
