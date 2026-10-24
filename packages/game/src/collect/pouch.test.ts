import { describe, expect, it } from "vitest";
import {
  award,
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
  boosters: { undo: 0, extraSlot: 0, hint: 0 },
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
    let p: Pouch = { ...empty(), coins: 20, boosters: { undo: 1, extraSlot: 0, hint: 0 } };
    expect(paymentFor(p, "undo")).toEqual({ kind: "owned" });
    p = pay(p, "undo", paymentFor(p, "undo"));
    expect(p.boosters.undo).toBe(0);
    expect(p.coins).toBe(20);
    expect(paymentFor(p, "undo")).toEqual({ kind: "coins", price: PRICES.undo });
    p = pay(p, "undo", paymentFor(p, "undo"));
    expect(p.coins).toBe(20 - PRICES.undo);
    expect(paymentFor(p, "undo")).toEqual({ kind: "short", price: PRICES.undo, missing: 10 });
    expect(pay(p, "undo", paymentFor(p, "undo"))).toBe(p);
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
  });

  it("any booster is bought within three first clears of even the smallest level", () => {
    let p = empty();
    for (let i = 0; i < 3; i++) p = award(p, `l${i}`, { cubes: 0 }).pouch;
    for (const b of BOOSTERS) expect(paymentFor(p, b).kind).toBe("coins");
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
      boosters: { undo: "x", hint: -2, extraSlot: 7.9 },
      paid: [1, "a", "a", ""],
    });
    expect(p.coins).toBe(0);
    expect(p.boosters).toEqual({ undo: STARTING_KIT.boosters.undo, hint: 0, extraSlot: 7 });
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
