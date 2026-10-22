/**
 * Onboarding: short coach tips, each shown once ever (remembered in the save), the first time the
 * moment it explains happens. The first ones form the level-1 tutorial (launch → collect →
 * portal → park → relaunch); the rest explain slots, boosters and hints when they first matter.
 * Tips never block play: they are banners in the HUD strip, and the board keeps running.
 */
export const TIPS = {
  launch: "Tap a column to send its front wisp around the board.",
  collect: "A wisp checks the first fragment it sees. If it's the wisp's color, it collects it.",
  portal: "Out of charge, a wisp leaves through the portal ✦",
  park: "This wisp still has charge, so it rests in a slot. Tap the slot to send it again.",
  relaunch: "That's the whole spell: clear every fragment to reveal the picture!",
  boosters: "Stuck? Boosters help: Undo, Shuffle, +1 Slot and Wand. Retry is always free.",
  slotsTight: "Only one slot left! A wisp ending its lap with no free slot loses the board.",
  hint: "Not sure what's next? A glowing wisp is a good move.",
} as const;

export type TipId = keyof typeof TIPS;

/** The level-1 tutorial, in order; marked seen for players who already won a level. */
export const TUTORIAL_TIPS: readonly TipId[] = ["launch", "collect", "portal", "park", "relaunch"];

/** What just happened on the board. */
export type TipTrigger =
  | { type: "start" }
  | { type: "launched"; fromSlot: boolean }
  | { type: "collected" }
  | { type: "portal" }
  | { type: "parked"; freeSlots: number; slots: number }
  | { type: "hint" };

/**
 * The tutorial is over once its last tip was shown, or once any level was won or skipped (a
 * player can clear level 1 without ever parking a wisp, or skip it after losing).
 */
export function tutorialDone(save: {
  tips: readonly string[];
  levels: object;
  skipped: readonly string[];
}): boolean {
  return (
    save.tips.includes("relaunch") || save.skipped.length > 0 || Object.keys(save.levels).length > 0
  );
}

/**
 * The tip a trigger should show, or `null` (already seen or queued, or nothing to explain).
 * `known` holds tips already seen plus those waiting in the queue.
 */
export function tipFor(trigger: TipTrigger, known: readonly string[], done = false): TipId | null {
  const once = (id: TipId): TipId | null => (known.includes(id) ? null : id);
  switch (trigger.type) {
    case "start":
      // First level: how to launch. Once the tutorial is done: the boosters, at a calm moment.
      if (!known.includes("launch")) return "launch";
      return done ? once("boosters") : null;
    case "collected":
      return once("collect");
    case "portal":
      return once("portal");
    case "parked":
      // The first park is explained on its own; "one slot left" waits for a later park.
      if (!known.includes("park")) return "park";
      return trigger.slots > 1 && trigger.freeSlots === 1 ? once("slotsTight") : null;
    case "launched":
      // Relaunching from a slot after the park tip closes the tutorial loop.
      return trigger.fromSlot && known.includes("park") ? once("relaunch") : null;
    case "hint":
      // During the tutorial the glow is the "tap here" pointer, explained by the tutorial tips.
      return done || known.includes("relaunch") ? once("hint") : null;
  }
}

/**
 * How long the board must sit idle before the hint glow. During the tutorial the glow is the
 * "tap here" pointer, so it comes almost at once.
 */
export function hintDelayMs(done: boolean, normal: number): number {
  return done ? normal : 1500;
}

/** A tip stays up at least this long before the next one may replace it. */
export const MIN_TIP_MS = 2800;

/** How long a tip stays up when nothing replaces it (about 60 ms a character). */
export function tipLifetimeMs(id: TipId): number {
  return Math.max(4500, TIPS[id].length * 60);
}

/**
 * Orders tips so each can be read: one on screen at a time, kept for at least `MIN_TIP_MS`
 * before a queued one replaces it. A tip counts as seen (to be saved) only once it has been on
 * screen that long, or was tapped away; tips that never made it on screen show another time.
 */
export class TipQueue {
  private queue: TipId[] = [];
  private shownMs = 0;
  private saved = false;
  current: TipId | null = null;

  /** Tips waiting or on screen: triggers should treat them as already seen. */
  get pending(): readonly TipId[] {
    return this.current ? [this.current, ...this.queue] : this.queue;
  }

  /** How long the current tip has been on screen. */
  get age(): number {
    return this.shownMs;
  }

  offer(id: TipId): void {
    if (this.current !== id && !this.queue.includes(id)) this.queue.push(id);
  }

  /**
   * Advances time. Returns tips that just became seen (save them) and, if the banner should
   * change, `show` (the new tip, or `null` to take the banner down).
   */
  tick(dtMs: number): { seen: TipId[]; show?: TipId | null } {
    const seen: TipId[] = [];
    if (this.current) {
      this.shownMs += dtMs;
      if (!this.saved && this.shownMs >= MIN_TIP_MS) seen.push(this.markSaved());
    }
    const expired = this.current !== null && this.shownMs >= tipLifetimeMs(this.current);
    const canReplace = this.current === null || this.shownMs >= MIN_TIP_MS;
    if (this.queue.length > 0 && canReplace) {
      this.current = this.queue.shift()!;
      this.shownMs = 0;
      this.saved = false;
      return { seen, show: this.current };
    }
    if (expired) {
      this.current = null;
      return { seen, show: null };
    }
    return { seen };
  }

  /** The player tapped the banner away: it counts as read. */
  dismiss(): TipId[] {
    if (!this.current) return [];
    const seen = this.saved ? [] : [this.markSaved()];
    this.current = null;
    return seen;
  }

  /**
   * The board ended: drop queued tips (they show another time). `keepCurrent` lets the tip on
   * screen finish (a win: it stays up until the result card).
   */
  clear(keepCurrent = false): void {
    this.queue = [];
    if (!keepCurrent) this.current = null;
  }

  private markSaved(): TipId {
    this.saved = true;
    return this.current!;
  }
}
