import type { KeyValueStore } from "./v2Spellbook";

/**
 * The v2 pouch (M14.4): the player's coins and booster stock on the v2 board, kept in its own key,
 * apart from the shipped game's save. Local only. Plain data and pure functions plus a storage
 * wrapper that never throws: storage trouble can cost a purchase's bookkeeping, never block play.
 * Rules and prices: docs/V2_BOOSTERS.md.
 */

export const BOOSTERS = ["undo", "extraSlot", "hint", "call", "sweep", "lantern"] as const;
export type Booster = (typeof BOOSTERS)[number];

/**
 * Prices in coins. A first clear pays 15–40, so every booster is one to three first clears away:
 * earnable, never necessary (Retry is always free).
 */
export const PRICES: Record<Booster, number> = {
  undo: 15,
  extraSlot: 40,
  hint: 10,
  // The power-ups (M15.13): Familiar's Call, Besom Sweep, Crystal Lantern.
  call: 25,
  sweep: 40,
  lantern: 15,
};

/** The power-ups a milestone can give for free (`award`). */
export const POWERS = ["call", "sweep", "lantern"] as const satisfies readonly Booster[];

/** Every this many first clears, one power-up is given free (picked by the level, not at random). */
export const GIFT_EVERY = 3;

/** What a first-time player starts with, so each booster can be tried before it is earned. */
export const STARTING_KIT = {
  coins: 50,
  boosters: {
    undo: 2,
    extraSlot: 1,
    hint: 2,
    call: 1,
    sweep: 1,
    lantern: 1,
  } satisfies Record<Booster, number>,
} as const;

export const POUCH_KEY = "hexhue.v2.pouch";

export interface Pouch {
  version: 1;
  coins: number;
  boosters: Record<Booster, number>;
  /** Ids of the levels whose first clear has been paid. */
  paid: string[];
}

export const startingPouch = (): Pouch => ({
  version: 1,
  coins: STARTING_KIT.coins,
  boosters: { ...STARTING_KIT.boosters },
  paid: [],
});

const count = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;

/**
 * Reads untrusted JSON: every field falls back on its own, so one bad value never wipes the rest; a
 * negative or missing count is never a free top-up (negative clamps to 0, missing keeps the default).
 */
export function parsePouch(json: unknown): Pouch {
  const fresh = startingPouch();
  if (typeof json !== "object" || json === null || Array.isArray(json)) return fresh;
  const o = json as Record<string, unknown>;
  const boosters = { ...fresh.boosters };
  const raw = o.boosters;
  if (typeof raw === "object" && raw !== null) {
    for (const b of BOOSTERS) boosters[b] = count((raw as Record<string, unknown>)[b], boosters[b]);
  }
  const paid = Array.isArray(o.paid)
    ? [...new Set(o.paid.filter((x): x is string => typeof x === "string" && x !== ""))]
    : [];
  return { version: 1, coins: count(o.coins, fresh.coins), boosters, paid };
}

export type Payment =
  | { kind: "owned" }
  | { kind: "coins"; price: number }
  | { kind: "short"; price: number; missing: number };

/** How a booster would be paid for right now: from stock first, then coins. */
export function paymentFor(p: Pouch, booster: Booster): Payment {
  if (p.boosters[booster] > 0) return { kind: "owned" };
  const price = PRICES[booster];
  return p.coins >= price
    ? { kind: "coins", price }
    : { kind: "short", price, missing: price - p.coins };
}

/** Applies a payment from `paymentFor` and returns the new pouch (the same pouch for "short"). */
export function pay(p: Pouch, booster: Booster, payment: Payment): Pouch {
  if (payment.kind === "owned")
    return { ...p, boosters: { ...p.boosters, [booster]: p.boosters[booster] - 1 } };
  if (payment.kind === "coins") return { ...p, coins: p.coins - payment.price };
  return p;
}

/** Coins for a win. The first clear of a level pays by size; replays pay a token so farming is slow. */
/** What the first clear of a Hard or Extreme level pays on top (M15.13): about the boosters it may take. */
export const CHALLENGE_BONUS = { hard: 20, extreme: 40 } as const;

export function winCoins(o: {
  cubes: number;
  firstClear: boolean;
  dailyBonus?: boolean;
  challenge?: keyof typeof CHALLENGE_BONUS | null;
}): number {
  const base = o.firstClear ? 15 + Math.min(25, Math.round(Math.max(0, o.cubes) / 40)) : 3;
  const bonus = o.firstClear && o.challenge ? CHALLENGE_BONUS[o.challenge] : 0;
  return base + bonus + (o.dailyBonus ? 15 : 0);
}

/** The power-up a milestone first clear of `levelId` gives: chosen by the level's id, so it is fixed. */
export function giftFor(levelId: string): (typeof POWERS)[number] {
  let h = 0;
  for (const ch of levelId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return POWERS[h % POWERS.length]!;
}

/**
 * Records a win: pays the first clear of `levelId` once, replays the token amount. Every
 * `GIFT_EVERY`th first clear also gives one power-up (M15.13), so each is earnable by playing.
 */
export function award(
  p: Pouch,
  levelId: string,
  o: { cubes: number; dailyBonus?: boolean; challenge?: keyof typeof CHALLENGE_BONUS | null },
): { pouch: Pouch; coins: number; firstClear: boolean; gift: Booster | null } {
  const firstClear = !p.paid.includes(levelId);
  const coins = winCoins({ ...o, firstClear });
  const paid = firstClear ? [...p.paid, levelId] : p.paid;
  const gift = firstClear && paid.length % GIFT_EVERY === 0 ? giftFor(levelId) : null;
  const boosters = gift ? { ...p.boosters, [gift]: p.boosters[gift] + 1 } : p.boosters;
  return { pouch: { ...p, coins: p.coins + coins, paid, boosters }, coins, firstClear, gift };
}

/** Reads the pouch and says whether the read can be trusted (a failed read is never overwritten). */
export function readPouch(store: KeyValueStore | null): { pouch: Pouch; ok: boolean } {
  try {
    const raw = store?.getItem(POUCH_KEY);
    return { pouch: raw ? parsePouch(JSON.parse(raw)) : startingPouch(), ok: store != null };
  } catch {
    return { pouch: startingPouch(), ok: false };
  }
}

/** Returns whether the pouch was stored; never throws. */
export function savePouch(store: KeyValueStore | null, pouch: Pouch): boolean {
  try {
    store?.setItem(POUCH_KEY, JSON.stringify(pouch));
    return store != null;
  } catch {
    return false;
  }
}
