/**
 * Onboarding: short coach tips, each shown once ever (remembered in the save), the first time the
 * moment it explains happens. The first ones form the level-1 tutorial (launch → collect →
 * portal → park → relaunch); the rest explain slots, boosters and hints when they first matter.
 * Tips never block play: they are banners, and the board keeps running underneath.
 */
export const TIPS = {
  launch: "Tap a column to send its front wisp around the board.",
  collect: "A wisp collects the first fragment of its color it can see, then keeps flying.",
  portal: "Out of charge, a wisp leaves through the portal ✦",
  park: "This wisp still has charge, so it rests in a slot. Tap the slot to send it around again.",
  relaunch: "That's the whole spell: clear every fragment to reveal the picture!",
  slotsTight:
    "Only one slot left! If a wisp finishes its lap with no free slot, the board is lost.",
  retry: "Retry is always free. Boosters below can help too: Undo, Shuffle, +1 Slot and Wand.",
  hint: "Not sure what's next? A glowing wisp is a good move.",
} as const;

export type TipId = keyof typeof TIPS;

/** What just happened on the board. */
export type TipTrigger =
  | { type: "start" }
  | { type: "launched"; fromSlot: boolean }
  | { type: "collected" }
  | { type: "portal" }
  | { type: "parked"; freeSlots: number; slots: number }
  | { type: "restarted"; afterLoss: boolean }
  | { type: "hint" };

/**
 * The tutorial is over once its last tip was shown, or once any level was won (a player can clear
 * level 1 without ever parking a wisp).
 */
export function tutorialDone(save: { tips: readonly string[]; levels: object }): boolean {
  return save.tips.includes("relaunch") || Object.keys(save.levels).length > 0;
}

/** The tip a trigger should show, or `null` (already seen, or nothing to explain). */
export function tipFor(trigger: TipTrigger, seen: readonly string[], done = false): TipId | null {
  const once = (id: TipId): TipId | null => (seen.includes(id) ? null : id);
  switch (trigger.type) {
    case "start":
      return once("launch");
    case "collected":
      return once("collect");
    case "portal":
      return once("portal");
    case "parked":
      // The first park is explained on its own; "one slot left" waits for a later park.
      if (!seen.includes("park")) return "park";
      return trigger.slots > 1 && trigger.freeSlots === 1 ? once("slotsTight") : null;
    case "launched":
      // Relaunching from a slot after the park tip closes the tutorial loop.
      return trigger.fromSlot && seen.includes("park") ? once("relaunch") : null;
    case "restarted":
      return trigger.afterLoss ? once("retry") : null;
    case "hint":
      // During the tutorial the glow is the "tap here" pointer, explained by the tutorial tips.
      return done || seen.includes("relaunch") ? once("hint") : null;
  }
}

/**
 * How long the board must sit idle before the hint glow. During the tutorial the glow is the
 * "tap here" pointer, so it comes almost at once.
 */
export function hintDelayMs(done: boolean, normal: number): number {
  return done ? normal : 1500;
}
