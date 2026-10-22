import { describe, expect, it } from "vitest";
import { PRICES, pay, paymentFor, winCoins } from "./economy";
import { defaultSave } from "./save/schema";

describe("winCoins", () => {
  it("pays more for harder first clears and a little for replays", () => {
    expect(winCoins({ difficulty: 0.06, stars: 2, firstClear: true })).toBe(12);
    expect(winCoins({ difficulty: 0.5, stars: 3, firstClear: true })).toBe(30);
    expect(winCoins({ difficulty: 0.5, stars: 3, firstClear: false })).toBe(3);
  });
});

describe("paymentFor / pay", () => {
  it("uses stock first, then coins, else reports what is missing", () => {
    const s = defaultSave(); // 2 of each, 100 coins
    expect(paymentFor(s, "wand")).toEqual({ kind: "owned" });
    s.boosters.wand = 0;
    expect(paymentFor(s, "wand")).toEqual({ kind: "coins", price: PRICES.wand });
    s.coins = 10;
    expect(paymentFor(s, "wand")).toEqual({ kind: "short", price: 50, missing: 40 });
  });

  it("spends exactly one booster or the price", () => {
    const s = defaultSave();
    pay(s, "undo", paymentFor(s, "undo"));
    expect(s.boosters.undo).toBe(1);
    s.boosters.shuffle = 0;
    pay(s, "shuffle", paymentFor(s, "shuffle"));
    expect(s.coins).toBe(100 - PRICES.shuffle);
    const before = JSON.stringify(s);
    s.coins = 0;
    pay(s, "wand", { kind: "short", price: 50, missing: 50 });
    expect(s.coins).toBe(0);
    expect(JSON.stringify({ ...s, coins: 70 })).toBe(before);
  });
});
