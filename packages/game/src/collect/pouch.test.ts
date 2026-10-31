import { describe, expect, it } from "vitest";
import {
  award,
  giftFor,
  GIFT_EVERY,
  BOOSTERS,
  parsePouch,
  pay,
  paymentFor,
  POUCH_KEY,
  PRICES,
  readPouch,
  savePouch,
  startingPouch,
  STARTING_KIT,
  winCoins,
  type Pouch,
} from "./pouch";

const empty = (): Pouch => ({
  ...startingPouch(),
  coins: 0,
  boosters: { extraSlot: 0, hint: 0, call: 0, sweep: 0, lantern: 0 },
});

const store = (initial?: string) => {
  const data = new Map<string, string>(initial === undefined ? [] : [[POUCH_KEY, initial]]);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe("starting kit", () => {
  it("lets a new player try every booster", () => {
    const p = startingPouch();
    for (const b of BOOSTERS) expect(paymentFor(p, b).kind).toBe("owned");
    expect(p.coins).toBe(STARTING_KIT.coins);
  });
});

describe("paying", () => {
  it("uses stock first, then coins, and never goes negative", () => {
    let p: Pouch = {
      ...empty(),
      coins: 20,
      boosters: { extraSlot: 0, hint: 1, call: 0, sweep: 0, lantern: 0 },
    };
    expect(paymentFor(p, "hint")).toEqual({ kind: "owned" });
    p = pay(p, "hint", paymentFor(p, "hint"));
    expect(p.boosters.hint).toBe(0);
    expect(p.coins).toBe(20);
    expect(paymentFor(p, "hint")).toEqual({ kind: "coins", price: PRICES.hint });
    p = pay(p, "hint", paymentFor(p, "hint"));
    expect(p.coins).toBe(20 - PRICES.hint);
    expect(paymentFor(p, "hint")).toEqual({ kind: "coins", price: PRICES.hint });
    p = pay(p, "hint", paymentFor(p, "hint"));
    expect(paymentFor(p, "hint")).toEqual({ kind: "short", price: PRICES.hint, missing: 10 });
    expect(pay(p, "hint", paymentFor(p, "hint"))).toBe(p);
  });

  it("does not mutate the pouch it was given", () => {
    const p = startingPouch();
    pay(p, "hint", paymentFor(p, "hint"));
    expect(p).toEqual(startingPouch());
  });
});

describe("earning (every booster is earnable by playing)", () => {
  it("pays a first clear once, then a token", () => {
    const first = award(empty(), "moon-1", { cubes: 400 });
    expect(first).toMatchObject({ firstClear: true, coins: 25 });
    const again = award(first.pouch, "moon-1", { cubes: 400 });
    expect(again).toMatchObject({ firstClear: false, coins: 3 });
    expect(again.pouch.paid).toEqual(["moon-1"]);
  });

  it("a daily's first completion adds a bonus", () => {
    expect(winCoins({ cubes: 0, firstClear: true, dailyBonus: true })).toBe(30);
    // Hard and Extreme first clears pay more; a replay does not.
    expect(winCoins({ cubes: 0, firstClear: true, challenge: "hard" })).toBe(35);
    expect(winCoins({ cubes: 0, firstClear: true, challenge: "extreme" })).toBe(55);
    expect(winCoins({ cubes: 0, firstClear: false, challenge: "extreme" })).toBe(3);
  });

  it("any booster is bought within three first clears of even the smallest level", () => {
    let p = empty();
    for (let i = 0; i < 3; i++) p = award(p, `l${i}`, { cubes: 0 }).pouch;
    // Affordable with coins (the third clear may also have given one power-up outright).
    for (const b of BOOSTERS) expect(paymentFor(p, b).kind).not.toBe("short");
    expect(p.coins).toBeGreaterThanOrEqual(Math.max(...Object.values(PRICES)));
  });

  it("replays are slow on purpose: 14 replays to afford an Extra Slot", () => {
    expect(Math.ceil(PRICES.extraSlot / winCoins({ cubes: 100, firstClear: false }))).toBe(14);
  });
});

describe("parsing and storage", () => {
  it("falls back field by field and never gives a free top-up", () => {
    expect(parsePouch(null)).toEqual(startingPouch());
    expect(parsePouch([])).toEqual(startingPouch());
    const p = parsePouch({
      coins: -5,
      boosters: { undo: 3, call: "x", hint: -2, extraSlot: 7.9 },
      paid: [1, "a", "a", ""],
    });
    expect(p.coins).toBe(0);
    // An old pouch's `undo` (the game has no Undo any more) is dropped.
    expect(p.boosters).toEqual({
      ...STARTING_KIT.boosters,
      call: STARTING_KIT.boosters.call,
      hint: 0,
      extraSlot: 7,
    });
    expect(p.paid).toEqual(["a"]);
  });

  it("round-trips through storage", () => {
    const s = store();
    const p = award(startingPouch(), "a", { cubes: 80 }).pouch;
    expect(savePouch(s, p)).toBe(true);
    expect(readPouch(s)).toEqual({ pouch: p, ok: true });
  });

  it("survives broken storage without throwing", () => {
    expect(readPouch(null)).toEqual({ pouch: startingPouch(), ok: false });
    expect(readPouch(store("{nope")).ok).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(readPouch(throwing).ok).toBe(false);
    expect(savePouch(throwing, startingPouch())).toBe(false);
    expect(savePouch(null, startingPouch())).toBe(false);
  });
});

describe("power-ups (M15.13)", () => {
  it("start with one of each, and an old pouch without them gets that starter one", () => {
    expect(startingPouch().boosters).toMatchObject({ call: 1, sweep: 1, lantern: 1 });
    const old = parsePouch({ coins: 5, boosters: { undo: 0, extraSlot: 0, hint: 0 }, paid: [] });
    expect(old.boosters).toMatchObject({ call: 1, sweep: 1, lantern: 1 });
  });

  it("every third first clear gives one power-up, fixed by the level; replays give none", () => {
    let p: Pouch = { ...empty(), paid: ["a", "b"] };
    const r = award(p, "c", { cubes: 200 });
    expect(r.gift).toBe(giftFor("c"));
    expect(r.pouch.boosters[r.gift!]).toBe(1);
    p = r.pouch;
    expect(award(p, "c", { cubes: 200 }).gift).toBeNull();
    expect(award(p, "d", { cubes: 200 }).gift).toBeNull();
    expect(GIFT_EVERY).toBe(3);
  });
});
