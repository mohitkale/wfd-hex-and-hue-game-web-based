import * as collect from "@hexhue/core/collect";
import type { PlayPaid } from "../analytics/types";
import { pay, paymentFor, type Booster, type Pouch } from "./pouch";

/**
 * Using a booster on a live session (M14.4, docs/V2_BOOSTERS.md): checks that it would do something,
 * charges for it (stock first, then coins) only when it did, and says what happened. Pure apart from
 * the session it acts on; the scene draws the message and stores the pouch.
 */

/** Most Extra Slots a level can gain: more would turn the slot puzzle into a coin sink. */
export const MAX_EXTRA_SLOTS = 2;

export interface UseResult {
  pouch: Pouch;
  /** The booster did something (and was charged unless `free`). */
  used: boolean;
  /** One line for the player. */
  message: string;
  /** Which paid booster was used and how it was paid for (for the gameplay events). */
  paid?: { booster: Booster; how: PlayPaid };
  /** The board must be laid out again (the slot count changed). */
  relayout?: boolean;
  /** A hint's suggestion, to highlight on the board. */
  suggest?: collect.Action;
}

const nothing = (pouch: Pouch, message: string): UseResult => ({ pouch, used: false, message });

/** How a booster that has just worked is paid for, as the analytics say it. */
const howPaid = (pouch: Pouch, booster: Booster, free: boolean): PlayPaid =>
  free ? "free" : paymentFor(pouch, booster).kind === "owned" ? "owned" : "coins";

/** Charges for a booster that has just worked; `free` (the tutorial) charges nothing. */
function charge(pouch: Pouch, booster: Booster, free: boolean): Pouch {
  return free ? pouch : pay(pouch, booster, paymentFor(pouch, booster));
}

function affordable(pouch: Pouch, booster: Booster, free: boolean): string | null {
  if (free) return null;
  const p = paymentFor(pouch, booster);
  if (p.kind !== "short") return null;
  return `Not enough coins (${p.missing} more). Retry is always free`;
}

/** Undo: back to before the last select/resume. */
export function useUndo(pouch: Pouch, session: collect.CollectSession, free: boolean): UseResult {
  if (session.state.status === "won") return nothing(pouch, "The level is already won");
  if (!session.canUndo) return nothing(pouch, "Nothing to undo");
  const short = affordable(pouch, "undo", free);
  if (short) return nothing(pouch, short);
  session.undo();
  const how = howPaid(pouch, "undo", free);
  return {
    pouch: charge(pouch, "undo", free),
    used: true,
    message: "Undone",
    paid: { booster: "undo", how },
  };
}

/**
 * Extra Slot: one more holding slot for this level; after a slots-full loss (or, with shared trays, a
 * deadlock a new tray opens up) it revives the game.
 */
export function useExtraSlot(
  pouch: Pouch,
  session: collect.CollectSession,
  free: boolean,
): UseResult {
  if (!session.canAddSlot) {
    return nothing(
      pouch,
      session.state.status === "won"
        ? "The level is already won"
        : "A tray can't free a stuck board. Retry is free",
    );
  }
  if (session.extraSlots >= MAX_EXTRA_SLOTS) {
    return nothing(pouch, `A level can gain ${MAX_EXTRA_SLOTS} extra slots at most`);
  }
  const short = affordable(pouch, "extraSlot", free);
  if (short) return nothing(pouch, short);
  const revived = session.state.status === "lost";
  session.addSlot();
  return {
    paid: { booster: "extraSlot", how: howPaid(pouch, "extraSlot", free) },
    pouch: charge(pouch, "extraSlot", free),
    used: true,
    relayout: true,
    message: revived ? "An extra slot opened and the game goes on" : "An extra slot opened",
  };
}

/** Hint: names a move that keeps the level winnable. Only a decided answer is charged for. */
export function useHint(pouch: Pouch, session: collect.CollectSession, free: boolean): UseResult {
  if (session.state.status !== "playing") return nothing(pouch, "The game is over");
  const short = affordable(pouch, "hint", free);
  if (short) return nothing(pouch, short);
  const hint = collect.hintFor(session.level, session.state, undefined, session.autoResume);
  switch (hint.kind) {
    case "move": {
      const a = hint.action;
      const message =
        a.kind === "select"
          ? `Summon column ${a.column + 1}`
          : `Resume the group waiting in slot ${a.slot + 1}`;
      return {
        pouch: charge(pouch, "hint", free),
        used: true,
        message,
        suggest: a,
        paid: { booster: "hint", how: howPaid(pouch, "hint", free) },
      };
    }
    case "doomed":
      return {
        pouch: charge(pouch, "hint", free),
        used: true,
        paid: { booster: "hint", how: howPaid(pouch, "hint", free) },
        message: "No play wins from here. Retry is free",
      };
    case "wait":
      return nothing(pouch, "Let the board settle, then ask again");
    case "unknown":
      return nothing(pouch, "Not sure from here. Trust your own eye");
    case "over":
      return nothing(pouch, "The game is over");
  }
}

/** The power-up names a player reads. */
export const POWER_NAMES = {
  call: "Familiar's Call",
  sweep: "Besom Sweep",
  lantern: "Crystal Lantern",
} as const;

/** Whether a power-up can be paid for now (stock or coins), with the reason when it cannot. */
export function canAfford(pouch: Pouch, booster: Booster): string | null {
  return affordable(pouch, booster, false);
}

/**
 * Familiar's Call (M15.13): the box at `depth` (behind the front) of `column` comes to the front.
 * Charged only when it moved a box.
 */
export function useCall(
  pouch: Pouch,
  session: collect.CollectSession,
  column: number,
  depth: number,
): UseResult {
  if (session.state.status !== "playing") return nothing(pouch, "The game is over");
  const short = affordable(pouch, "call", false);
  if (short) return nothing(pouch, short);
  if (!session.callForward(column, depth)) return nothing(pouch, "Tap a box behind the front row");
  return {
    paid: { booster: "call", how: howPaid(pouch, "call", false) },
    pouch: charge(pouch, "call", false),
    used: true,
    message: "Called to the front",
  };
}

/**
 * Besom Sweep (M15.13): the next familiars of box `group` (in a tray) fly over the picture to its
 * buried cubes. Charged only when it was cast.
 */
export function useSweep(pouch: Pouch, session: collect.CollectSession, group: number): UseResult {
  if (session.state.status !== "playing") return nothing(pouch, "The game is over");
  const short = affordable(pouch, "sweep", false);
  if (short) return nothing(pouch, short);
  if (!session.sweep(group)) return nothing(pouch, "Tap a box in a tray that still has familiars");
  return {
    paid: { booster: "sweep", how: howPaid(pouch, "sweep", false) },
    pouch: charge(pouch, "sweep", false),
    used: true,
    message: `Its next ${collect.SWEEP_CUBES} fly over the picture`,
  };
}

/**
 * Crystal Lantern (M15.13): every box of every column shows for the rest of the level. Lighting it
 * costs once; the scene remembers it is lit, so reopening it is free.
 */
export function useLantern(pouch: Pouch, session: collect.CollectSession): UseResult {
  if (session.state.status !== "playing") return nothing(pouch, "The game is over");
  const short = affordable(pouch, "lantern", false);
  if (short) return nothing(pouch, short);
  return {
    paid: { booster: "lantern", how: howPaid(pouch, "lantern", false) },
    pouch: charge(pouch, "lantern", false),
    used: true,
    message: "",
  };
}
