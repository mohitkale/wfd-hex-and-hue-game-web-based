import type Phaser from "phaser";

/**
 * Small witchy landmarks along the level map (M15.13): crescent moons, crystals, toadstools, candles,
 * potions and twinkles, drawn as flat vector shapes at `size` (their height, device px) with the base
 * at `x, y`. Decorative only. Kept apart from the scene so the map's look lives in one place.
 */
export const DECOR = ["moon", "crystal", "toadstool", "candle", "potion", "twinkle"] as const;
export type Decor = (typeof DECOR)[number];

type G = Phaser.GameObjects.Graphics;

export function drawDecor(g: G, kind: Decor, x: number, y: number, size: number): void {
  const s = size;
  switch (kind) {
    case "moon": {
      // A soft glow, the moon's disc and a second disc of the sky over it: a crescent.
      g.fillStyle(0xffe9a8, 0.12);
      g.fillCircle(x, y - s * 0.5, s * 0.75);
      g.fillStyle(0xffe08a, 1);
      g.fillCircle(x, y - s * 0.5, s * 0.42);
      g.fillStyle(0x24164a, 1);
      g.fillCircle(x + s * 0.2, y - s * 0.62, s * 0.36);
      return;
    }
    case "crystal": {
      const shard = (cx: number, w: number, h: number, c: number, light: number) => {
        g.fillStyle(c, 1);
        g.fillTriangle(cx - w, y, cx + w, y, cx, y - h);
        g.fillStyle(light, 0.9);
        g.fillTriangle(cx - w * 0.15, y, cx + w, y, cx, y - h);
      };
      shard(x - s * 0.22, s * 0.16, s * 0.6, 0x7a4fd0, 0xb48cff);
      shard(x + s * 0.24, s * 0.14, s * 0.5, 0x5a7fe0, 0x9fc0ff);
      shard(x, s * 0.2, s * 0.95, 0x9a5be6, 0xd4b2ff);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(x - s * 0.02, y - s * 0.7, s * 0.04);
      return;
    }
    case "toadstool": {
      g.fillStyle(0xf3e6cf, 1);
      g.fillRoundedRect(x - s * 0.12, y - s * 0.45, s * 0.24, s * 0.45, s * 0.08);
      g.fillStyle(0xe2463c, 1);
      g.slice(x, y - s * 0.42, s * 0.42, Math.PI, 0, false);
      g.fillPath();
      g.fillStyle(0xffffff, 0.95);
      for (const [dx, dy, r] of [
        [-0.2, -0.56, 0.07],
        [0.06, -0.7, 0.08],
        [0.24, -0.52, 0.06],
      ] as const)
        g.fillCircle(x + dx * s, y + dy * s, r * s);
      return;
    }
    case "candle": {
      g.fillStyle(0xffd27a, 0.18);
      g.fillCircle(x, y - s * 0.78, s * 0.32);
      g.fillStyle(0xf4ead6, 1);
      g.fillRoundedRect(x - s * 0.1, y - s * 0.6, s * 0.2, s * 0.6, s * 0.04);
      g.fillStyle(0xffb63a, 1);
      g.fillEllipse(x, y - s * 0.74, s * 0.12, s * 0.24);
      g.fillStyle(0xfff4c8, 1);
      g.fillEllipse(x, y - s * 0.71, s * 0.05, s * 0.11);
      return;
    }
    case "potion": {
      g.fillStyle(0x3fd0a0, 0.9);
      g.fillCircle(x, y - s * 0.3, s * 0.3);
      g.fillStyle(0xc8f6e6, 0.5);
      g.fillCircle(x - s * 0.1, y - s * 0.38, s * 0.08);
      g.fillStyle(0xd9c7ff, 0.9);
      g.fillRect(x - s * 0.08, y - s * 0.72, s * 0.16, s * 0.16);
      g.fillStyle(0x8a5a33, 1);
      g.fillRect(x - s * 0.1, y - s * 0.82, s * 0.2, s * 0.1);
      return;
    }
    case "twinkle": {
      const star = (cx: number, cy: number, r: number) => {
        g.fillStyle(0xfff1b8, 1);
        g.fillTriangle(cx - r * 0.25, cy, cx + r * 0.25, cy, cx, cy - r);
        g.fillTriangle(cx - r * 0.25, cy, cx + r * 0.25, cy, cx, cy + r);
        g.fillTriangle(cx, cy - r * 0.25, cx, cy + r * 0.25, cx - r, cy);
        g.fillTriangle(cx, cy - r * 0.25, cx, cy + r * 0.25, cx + r, cy);
      };
      star(x, y - s * 0.5, s * 0.32);
      star(x + s * 0.34, y - s * 0.12, s * 0.16);
      star(x - s * 0.3, y - s * 0.82, s * 0.12);
      return;
    }
  }
}
