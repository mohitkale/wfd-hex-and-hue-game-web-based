import Phaser from "phaser";
import type { Particle, Particles } from "./particles";

/**
 * Draws a `Particles` buffer with a fixed pool of additive glow images (created once). Each frame it
 * places the live particles and hides the rest; it allocates nothing and never grows.
 */
export class ParticleLayer {
  private readonly images: Phaser.GameObjects.Image[];
  private shown = 0;
  private next = 0;
  private now = 0;
  /** Bound once so the per-frame walk over the particles allocates no closure. */
  private readonly place = (p: Readonly<Particle>, age: number): void => {
    const t = this.now - p.born;
    const size = p.s0 + (p.s1 - p.s0) * age;
    this.images[this.next++]!.setPosition(p.x + p.vx * t, p.y + p.vy * t)
      .setDisplaySize(size, size)
      .setTint(p.color)
      .setAlpha(p.alpha * (1 - age))
      .setVisible(true);
  };

  constructor(
    scene: Phaser.Scene,
    private readonly particles: Particles,
    texture: string,
    depth: number,
  ) {
    this.images = Array.from({ length: particles.capacity }, () =>
      scene.add
        .image(0, 0, texture)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(depth)
        .setVisible(false),
    );
  }

  update(now: number): void {
    this.now = now;
    this.next = 0;
    this.particles.forEachLive(now, this.place);
    for (let j = this.next; j < this.shown; j++) this.images[j]!.setVisible(false);
    this.shown = this.next;
  }
}
