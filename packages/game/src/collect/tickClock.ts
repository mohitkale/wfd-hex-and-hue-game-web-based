/**
 * Turns frame time into whole simulation ticks. The renderer owns the clock; the rules never read
 * time (GAME_DESIGN_V2 §9): speed only changes how many ticks are shown per second, so 1× and 2×
 * play out identically. If the device falls behind, at most `maxPerFrame` ticks run per frame and
 * logical time simply runs slower than wall time; ticks are never skipped or merged.
 */
/**
 * How many ticks the board shows a second at 1× (the owner found 24 "pretty fast": the familiars ran
 * too quickly to follow). One tick is one cell, so a 14-cell route takes about a second. The rules never
 * read this; the speed-up multiplies it.
 */
export const SHOWN_TICKS_PER_SECOND = 14;

export class TickClock {
  private acc = 0;

  constructor(
    /** Ticks per second at 1×. */
    readonly ticksPerSecond = 24,
    readonly maxPerFrame = 4,
  ) {}

  get tickMs(): number {
    return 1000 / this.ticksPerSecond;
  }

  /** Adds `dtMs` of frame time at `speed` and returns how many ticks are due now. */
  advance(dtMs: number, speed: number): number {
    if (!(dtMs > 0)) return 0;
    this.acc += dtMs * speed;
    const step = this.tickMs;
    let due = Math.floor(this.acc / step);
    if (due > this.maxPerFrame) {
      // Behind: run the cap now and drop the backlog beyond one more tick, so we never snowball.
      this.acc = this.acc - this.maxPerFrame * step;
      this.acc = Math.min(this.acc, step * 0.999);
      return this.maxPerFrame;
    }
    this.acc -= due * step;
    if (due < 0) due = 0;
    return due;
  }

  /** How far through the current tick we are, 0..1 (for interpolation, after `advance`). */
  get alpha(): number {
    return Math.max(0, Math.min(1, this.acc / this.tickMs));
  }

  /**
   * Drops whole ticks that are due while nothing is ticking (the game is settled or over), keeping
   * `alpha` continuous so nothing snaps back mid-step and the next action starts within a tick.
   */
  drain(): void {
    this.acc = Math.min(this.acc, this.tickMs * 0.999);
  }

  /** Starts the next tick from zero (e.g. after a pause or an undo). */
  reset(): void {
    this.acc = 0;
  }
}
