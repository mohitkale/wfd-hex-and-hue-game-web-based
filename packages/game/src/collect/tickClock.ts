/**
 * Turns frame time into whole simulation ticks. The renderer owns the clock; the rules never read
 * time (GAME_DESIGN_V2 §9): speed only changes how many ticks are shown per second, so 1× and 2×
 * play out identically. If the device falls behind, at most `maxPerFrame` ticks run per frame and
 * logical time simply runs slower than wall time; ticks are never skipped or merged.
 */
/**
 * How many ticks the board shows a second at 1×. One tick is one cell. The owner found 24 and 14 too
 * fast, and 5 far too slow ("like 0.25×"); 8 was judged on a build that only reached 30 fps. The rules
 * never read this; 3× multiplies it.
 */
export const SHOWN_TICKS_PER_SECOND = 8;

/**
 * How fast a familiar walks on screen at 1×, in css px a second (M15.13). Speed used to be cells a
 * second, so the same setting looked fast on a 14-wide picture (22 px cells) and crawled on a 32-wide
 * one (10 px cells): the owner saw both "already 3×" and "like 0.25×". It is now the same on every board.
 */
export const WALK_CSS_PER_SECOND = 150;

/** Ticks a second at 1× for a board whose cells are `cellCss` css px: a steady on-screen walk. */
export function ticksPerSecondFor(cellCss: number): number {
  // Up to 36 a second: the journey's finer mosaic has cubes of about 5 css px (M15.14).
  return Math.max(4, Math.min(36, WALK_CSS_PER_SECOND / Math.max(1, cellCss)));
}

export class TickClock {
  private acc = 0;

  constructor(
    /** Ticks per second at 1×. */
    readonly ticksPerSecond = 24,
    /** Enough for 3× of the fastest board at 14 frames a second (about 4.3 ticks a frame), if a slow device drops that low. */
    readonly maxPerFrame = 6,
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
