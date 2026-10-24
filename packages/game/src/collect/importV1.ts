import type { SaveData } from "../save/schema";
import { startingPouch, type Pouch } from "./pouch";

/**
 * Carrying a player's coins and boosters over from the shipped v1 game (v2.0.0, docs/V2_MIGRATION.md).
 * v1 keeps its own save (`hexhue.save`) and v2 its own books (`hexhue.v2.*`): the import never writes
 * the v1 save (only the shared settings change there, when edited in the v2 Menu), so a rollback to v1
 * loses no progress. What comes
 * across, once:
 *
 * | v1 | v2 |
 * | --- | --- |
 * | coins | coins (all of them) |
 * | Undo | Undo |
 * | +1 Slot (extraSlot) | Extra Slot |
 * | Shuffle + Magic Wand | Hint (one for each: neither exists in v2, Hint is the nearest help) |
 *
 * Levels, stars and tips do not map (v1's levels are another game); settings are the same object and
 * need no migration. The tutorial is still offered: v2 plays differently.
 */

/** Whether a v1 save shows a player who has actually played (a fresh save is only the starting kit). */
export function v1Played(v1: SaveData): boolean {
  return v1.stats.plays > 0 || Object.keys(v1.levels).length > 0;
}

/** Whether the v2 pouch is still exactly what a new player gets (nothing earned, spent or paid). */
export function untouched(p: Pouch): boolean {
  const fresh = startingPouch();
  return (
    p.coins === fresh.coins &&
    p.paid.length === 0 &&
    p.boosters.undo === fresh.boosters.undo &&
    p.boosters.extraSlot === fresh.boosters.extraSlot &&
    p.boosters.hint === fresh.boosters.hint
  );
}

export interface Imported {
  pouch: Pouch;
  /** Whether anything was carried over (to say so once). */
  carried: boolean;
}

/**
 * The pouch after the one-time import, or null if nothing should change this time (already imported).
 * A v1 player who has played gets their balances if their v2 pouch is still untouched; a pouch that
 * v2 play has already changed is never overwritten (it is just marked as handled). A v1 save with no
 * play in it is left alone and not marked, so a later v1 session can still be carried over.
 */
export function importV1(v1: SaveData, pouch: Pouch): Imported | null {
  if (pouch.imported) return null;
  if (!v1Played(v1)) return null;
  if (!untouched(pouch)) return { pouch: { ...pouch, imported: true }, carried: false };
  return {
    pouch: {
      ...pouch,
      coins: v1.coins,
      boosters: {
        undo: v1.boosters.undo,
        extraSlot: v1.boosters.extraSlot,
        hint: v1.boosters.shuffle + v1.boosters.wand,
      },
      imported: true,
    },
    carried: true,
  };
}
