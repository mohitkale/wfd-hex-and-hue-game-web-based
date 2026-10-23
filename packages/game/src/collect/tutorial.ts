import type * as collect from "@hexhue/core/collect";

/**
 * The tutorial state machine (M14.2): teaches by interaction, not by text. A tutorial level has a
 * script of steps; each step shows one very short hint (at most six words) and points at the thing to
 * tap, and is finished by something the player did, never by a timer or a "Next" button. The machine
 * is pure (no Phaser), reads only the game state and a few flags the board reports, and never changes
 * the game: it cannot stop a tap, and the player can ignore it or skip it at any moment.
 */

export type Target =
  { kind: "column"; index: number } | { kind: "slot"; index: number } | { kind: "undo" } | null;

export interface Hint {
  /** Stable id of the step, for tests and the doc. */
  id: string;
  /** At most six words. */
  text: string;
  target: Target;
}

/** What a step can look at: the state and what the board has told the machine so far. */
export interface Context {
  state: Readonly<collect.CollectState>;
  /** Flags the board reports: "rejected" (a tap was refused), "undone". */
  seen: ReadonlySet<string>;
  /** True once the step's hint has been shown (its `ready` was true) at some point. */
  shown: boolean;
}

export interface Step {
  id: string;
  text: string;
  /** Where to point, from the current state (null: nothing to point at). */
  target: (state: Readonly<collect.CollectState>) => Target;
  /**
   * Whether the hint is true right now (default: always). A step that is not ready shows nothing and
   * waits: a hint never says "it waits" before anything waits, or "tap Undo" when nothing is lost.
   */
  ready?: (state: Readonly<collect.CollectState>) => boolean;
  /** True once the player has done what the step teaches (or the game has moved past it). */
  done: (c: Context) => boolean;
}

export const MAX_HINT_WORDS = 6;

export class Tutorial {
  private at = 0;
  private readonly seen = new Set<string>();
  private readonly shown = new Set<number>();
  private skipped = false;

  constructor(readonly script: readonly Step[]) {
    for (const s of script) {
      if (s.text.trim().split(/\s+/).length > MAX_HINT_WORDS)
        throw new Error(`tutorial step ${s.id}: hint is longer than ${MAX_HINT_WORDS} words`);
    }
  }

  /** The board reports something the state alone does not show. */
  note(flag: string): void {
    this.seen.add(flag);
  }

  /** The player does not want it: no more hints, ever (for this machine). */
  skip(): void {
    this.skipped = true;
  }

  /** How many steps have been passed (never goes down). */
  get position(): number {
    return this.at;
  }

  get finished(): boolean {
    return this.skipped || this.at >= this.script.length;
  }

  /**
   * Moves past every step the player has already done and returns the hint to show now, or null when
   * the tutorial is over or skipped. Steps are never revisited: what was taught stays taught.
   */
  update(state: Readonly<collect.CollectState>): Hint | null {
    if (this.skipped) return null;
    while (this.at < this.script.length) {
      const step = this.script[this.at]!;
      if (!step.done({ state, seen: this.seen, shown: this.shown.has(this.at) })) {
        if (step.ready && !step.ready(state)) return null;
        this.shown.add(this.at);
        return { id: step.id, text: step.text, target: step.target(state) };
      }
      this.at++;
    }
    return null;
  }
}
