/**
 * Completion effects (M11.5): what a win reveals and how, chosen by the picture's theme. Pure data
 * and maths, free of Phaser, so the choice and the schedule are unit tested. Like every effect in
 * the v2 board it is presentation only: nothing here reads or changes the game.
 */

export type RevealOrder = "diagonal" | "bottom-up" | "radial" | "top-down" | "scatter";
export type ParticleKind = "twinkle" | "rise" | "burst" | "spark";

export interface EffectSpec {
  id: "illuminate" | "bubbles" | "glow" | "constellation" | "awaken" | "bloom";
  /** Shown on the end card under the picture's name. */
  caption: string;
  order: RevealOrder;
  /** How long the reveal takes at normal motion. */
  durationMs: number;
  particle: { kind: ParticleKind; color: number; count: number; lifeMs: number };
}

const SPECS: Record<string, EffectSpec> = {
  moon: {
    id: "illuminate",
    caption: "The moon is lit",
    order: "diagonal",
    durationMs: 1800,
    particle: { kind: "twinkle", color: 0xfff6d8, count: 18, lifeMs: 1400 },
  },
  ritual: {
    id: "bubbles",
    caption: "The brew bubbles up",
    order: "bottom-up",
    durationMs: 1700,
    particle: { kind: "rise", color: 0x78d9cd, count: 22, lifeMs: 1500 },
  },
  crystal: {
    id: "glow",
    caption: "The crystals glow",
    order: "radial",
    durationMs: 1600,
    particle: { kind: "burst", color: 0xdcc7f4, count: 20, lifeMs: 1200 },
  },
  astrology: {
    id: "constellation",
    caption: "The sign is revealed",
    order: "scatter",
    durationMs: 2000,
    particle: { kind: "twinkle", color: 0xf6d97a, count: 16, lifeMs: 1600 },
  },
  familiar: {
    id: "awaken",
    caption: "It opens its eyes",
    order: "top-down",
    durationMs: 1500,
    particle: { kind: "spark", color: 0x95d594, count: 14, lifeMs: 1100 },
  },
};

const DEFAULT_SPEC: EffectSpec = {
  id: "bloom",
  caption: "The picture blooms",
  order: "radial",
  durationMs: 1500,
  particle: { kind: "burst", color: 0xf6d97a, count: 14, lifeMs: 1100 },
};

/** The effect for a picture's theme; any other theme gets the plain bloom. */
export function effectForTheme(theme: string): EffectSpec {
  return SPECS[theme] ?? DEFAULT_SPEC;
}

/** A stable pseudo-random value in [0, 1) for a cell (no Math.random: effects repeat exactly). */
function cellHash(x: number, y: number, salt = 0): number {
  let h = (Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + salt * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * When each cell of a `width`×`height` picture appears, 0..1 along the reveal, in row-major order
 * (`NaN`-free for every cell, including empty ones: callers skip those). The first cells are at 0
 * and the last at 1 for every order, so the reveal always completes.
 */
export function revealTimes(width: number, height: number, order: RevealOrder): number[] {
  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      switch (order) {
        case "diagonal":
          raw.push(x + y);
          break;
        case "bottom-up":
          raw.push(height - 1 - y + cellHash(x, y) * 0.8);
          break;
        case "top-down":
          raw.push(y + cellHash(x, y, 1) * 0.8);
          break;
        case "radial":
          raw.push(Math.hypot(x - (width - 1) / 2, y - (height - 1) / 2));
          break;
        case "scatter":
          raw.push(cellHash(x, y, 2));
          break;
      }
    }
  }
  const min = Math.min(...raw);
  const span = Math.max(...raw) - min || 1;
  return raw.map((v) => (v - min) / span);
}

/**
 * How far the reveal has got, 0..1. Reduced motion shows the finished picture at once, and so does
 * a skip: the reveal is never a gate on anything.
 */
export function revealProgress(
  elapsedMs: number,
  spec: Pick<EffectSpec, "durationMs">,
  opts: { reduced: boolean; skipped: boolean },
): number {
  if (opts.reduced || opts.skipped) return 1;
  return Math.max(0, Math.min(1, elapsedMs / spec.durationMs));
}

/** How many particles a reveal makes: none with reduced motion. */
export function particleBudget(spec: EffectSpec, reduced: boolean): number {
  return reduced ? 0 : spec.particle.count;
}

export interface ParticleSeed {
  /** Position in picture cells (0..width, 0..height) and the delay before it is born, in ms. */
  x: number;
  y: number;
  delayMs: number;
  /** Velocity in cells per second. */
  vx: number;
  vy: number;
}

/** Where and when the reveal's particles start, deterministically for a picture size and effect. */
export function particleSeeds(spec: EffectSpec, width: number, height: number): ParticleSeed[] {
  const seeds: ParticleSeed[] = [];
  for (let i = 0; i < spec.particle.count; i++) {
    const a = cellHash(i, 7, 3);
    const b = cellHash(i, 11, 5);
    const c = cellHash(i, 13, 9);
    const delayMs = Math.round(a * spec.durationMs);
    switch (spec.particle.kind) {
      case "rise":
        seeds.push({
          x: b * width,
          y: height * (0.7 + 0.3 * c),
          delayMs,
          vx: (c - 0.5) * 0.6,
          vy: -2.4 - a,
        });
        break;
      case "burst": {
        const ang = b * Math.PI * 2;
        seeds.push({
          x: width / 2,
          y: height / 2,
          delayMs,
          vx: Math.cos(ang) * (2 + c * 3),
          vy: Math.sin(ang) * (2 + c * 3),
        });
        break;
      }
      case "spark":
        seeds.push({
          x: width * (0.3 + 0.4 * b),
          y: height * (0.2 + 0.2 * c),
          delayMs,
          vx: (b - 0.5) * 2.4,
          vy: -1.2 - c,
        });
        break;
      case "twinkle":
        seeds.push({ x: b * width, y: c * height, delayMs, vx: 0, vy: -0.2 });
        break;
    }
  }
  return seeds;
}
