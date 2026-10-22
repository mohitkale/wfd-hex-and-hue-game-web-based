import type { BoosterKind, SaveData } from "./save/schema";

/**
 * Booster prices in coins. A first clear pays 10–25, so one booster costs one to three levels of
 * play: earnable, never necessary (Retry is always free, and skipping is offered after 3 losses).
 */
export const PRICES: Record<BoosterKind, number> = {
  undo: 20,
  shuffle: 30,
  extraSlot: 40,
  wand: 50,
};

/** Coins for a win: the first clear pays by difficulty (+5 for a clean 3★), replays pay a little. */
export function winCoins(opts: { difficulty: number; stars: number; firstClear: boolean }): number {
  if (!opts.firstClear) return 3;
  return 10 + Math.round(opts.difficulty * 30) + (opts.stars === 3 ? 5 : 0);
}

export type Payment =
  | { kind: "owned" }
  | { kind: "coins"; price: number }
  | { kind: "short"; price: number; missing: number };

/** How a booster would be paid for right now: from stock first, then coins. */
export function paymentFor(
  save: Pick<SaveData, "boosters" | "coins">,
  booster: BoosterKind,
): Payment {
  if (save.boosters[booster] > 0) return { kind: "owned" };
  const price = PRICES[booster];
  return save.coins >= price
    ? { kind: "coins", price }
    : { kind: "short", price, missing: price - save.coins };
}

/** Applies a payment returned by `paymentFor` (no-op for "short"). */
export function pay(save: SaveData, booster: BoosterKind, payment: Payment): void {
  if (payment.kind === "owned") save.boosters[booster]--;
  else if (payment.kind === "coins") save.coins -= payment.price;
}
