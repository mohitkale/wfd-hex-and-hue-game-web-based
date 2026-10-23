/**
 * Short-lived decorative particles (carry trails, delivery sparks, completion blooms) as plain data in
 * a fixed ring buffer, so a busy board never allocates per frame or grows without bound: a full
 * buffer simply recycles the oldest particle. Nothing here reads or changes game state.
 */

export interface Particle {
  x: number;
  y: number;
  /** Pixels per millisecond. */
  vx: number;
  vy: number;
  born: number;
  life: number;
  color: number;
  /** Display size in pixels at birth and at death. */
  s0: number;
  s1: number;
  /** Peak alpha; it fades linearly to 0 over the particle's life. */
  alpha: number;
}

export class Particles {
  private readonly items: Particle[];
  private head = 0;
  private live = 0;

  constructor(readonly capacity = 160) {
    this.items = Array.from({ length: capacity }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      born: 0,
      life: 0,
      color: 0,
      s0: 0,
      s1: 0,
      alpha: 0,
    }));
  }

  /** Adds a particle, recycling the oldest when the buffer is full. */
  emit(p: Particle): void {
    const slot = this.items[this.head]!;
    slot.x = p.x;
    slot.y = p.y;
    slot.vx = p.vx;
    slot.vy = p.vy;
    slot.born = p.born;
    slot.life = p.life;
    slot.color = p.color;
    slot.s0 = p.s0;
    slot.s1 = p.s1;
    slot.alpha = p.alpha;
    this.head = (this.head + 1) % this.capacity;
    if (this.live < this.capacity) this.live++;
  }

  /**
   * Calls `visit(particle, age)` for every particle still alive at `now`, where `age` runs 0..1
   * over its life, and returns how many were visited. Expired particles are skipped.
   */
  forEachLive(now: number, visit: (p: Readonly<Particle>, age: number) => void): number {
    let n = 0;
    for (let i = 0; i < this.live; i++) {
      const p = this.items[i]!;
      const age = (now - p.born) / p.life;
      if (age < 0 || age >= 1) continue;
      visit(p, age);
      n++;
    }
    return n;
  }

  /** Particles alive at `now`. */
  count(now: number): number {
    return this.forEachLive(now, () => undefined);
  }

  clear(): void {
    this.head = 0;
    this.live = 0;
  }
}

/** Where a trail puff is left behind a carrier, at most this often (in ticks). */
const TRAIL_GAP_TICKS = 1.5;
const TRAIL_LIFE_TICKS = 6;

/**
 * Decides which particles the board's events and movement produce. Time-based sizes scale with the
 * tick length, so effects look the same at 1× and 2× (a shorter tick is a faster show, never
 * different outcomes). With reduced motion nothing travels: no trails, no sparks and no growing
 * rings; a completion is a short, stationary fade of light.
 */
export class Emitter {
  /** Milliseconds per tick as currently shown (shorter at 2×). */
  tickMs = 1000 / 24;

  constructor(
    readonly particles: Particles,
    private readonly cellPx: number,
    private readonly reduced: boolean,
  ) {}

  /**
   * A soft puff behind a carrying familiar. `lastAt` is when this carrier last left one; returns the
   * new `lastAt` (unchanged when it is too soon), so the caller keeps the throttle per carrier.
   */
  trail(x: number, y: number, color: number, now: number, lastAt: number): number {
    if (this.reduced || now - lastAt < this.tickMs * TRAIL_GAP_TICKS) return lastAt;
    this.particles.emit({
      x,
      y,
      vx: 0,
      vy: 0,
      born: now,
      life: this.tickMs * TRAIL_LIFE_TICKS,
      color,
      s0: this.cellPx * 0.55,
      s1: this.cellPx * 0.15,
      alpha: 0.35,
    });
    return now;
  }

  /** `n` sparks fanning upward from (x, y). */
  sparks(x: number, y: number, color: number, n: number, now: number, reach = 1.1): void {
    if (this.reduced) return;
    const life = this.tickMs * 7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i + 0.5) / n - 0.5) * Math.PI;
      const speed = (this.cellPx * reach) / life;
      this.particles.emit({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        born: now,
        life,
        color,
        s0: this.cellPx * 0.3,
        s1: this.cellPx * 0.1,
        alpha: 0.9,
      });
    }
  }

  /** A glow that swells and fades where something was finished (stationary for reduced motion). */
  bloom(x: number, y: number, color: number, now: number, size = 2.6): void {
    const s0 = this.cellPx * (this.reduced ? size * 0.8 : 0.6);
    this.particles.emit({
      x,
      y,
      vx: 0,
      vy: 0,
      born: now,
      life: this.tickMs * (this.reduced ? 8 : 10),
      color,
      s0,
      s1: this.reduced ? s0 : this.cellPx * size,
      alpha: 0.7,
    });
  }

  /** The win flourish: a fountain from (x, y) in each of `colors`, one fan per colour. */
  fountain(x: number, y: number, colors: readonly number[], now: number): void {
    if (this.reduced) return;
    colors.forEach((c, i) => this.sparks(x, y, c, 6, now + i * this.tickMs * 0.5, 2.6));
  }
}
