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

/** Extra Slot: one more holding slot for this level; after a slots-full loss it revives the game. */
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
        : "A slot can't undo a deadlock. Undo or Retry",
    );
  }
  if (session.extraSlots >= MAX_EXTRA_SLOTS) {
    return nothing(pouch, `A level can gain ${MAX_EXTRA_SLOTS} extra slots at most`);
  }
  const short = affordable(pouch, "extraSlot", free);
  if (short) return nothing(pouch, short);
  const revived = session.state.lossReason === "slotsFull";
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
  const hint = collect.hintFor(session.level, session.state);
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
        message: "No play wins from here. Undo, or Retry (free)",
      };
    case "wait":
      return nothing(pouch, "Let the board settle, then ask again");
    case "unknown":
      return nothing(pouch, "Not sure from here. Trust your own eye");
    case "over":
      return nothing(pouch, "The game is over");
  }
}
