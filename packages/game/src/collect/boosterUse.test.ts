import { EMPTY } from "@hexhue/core";
import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { MAX_EXTRA_SLOTS, useExtraSlot, useHint, useUndo } from "./boosterUse";
import { startingPouch, PRICES, type Pouch } from "./pouch";

/** Rows of colour characters (`.` open) and columns of [colour, capacity], as in core's fixtures. */
function board(
  rows: string[],
  columns: [string, number][][],
  o: { colors: string; slots: number; squad?: number; spawnGap?: number },
): collect.CollectLevel {
  return {
    id: "test",
    name: "test",
    width: rows[0]!.length,
    height: rows.length,
    palette: ["#e24a4a", "#4ae26b", "#4a6be2"].slice(0, o.colors.length),
    cells: [...rows.join("")].map((ch) => (ch === "." ? EMPTY : o.colors.indexOf(ch))),
    columns: columns.map((col) =>
      col.map(([ch, capacity]) => ({ color: o.colors.indexOf(ch), capacity })),
    ),
    slots: o.slots,
    squad: o.squad ?? 3,
    spawnGap: o.spawnGap ?? 2,
    fieldCap: 3,
  };
}

const fixtureB = () =>
  board(["BBBBB", "BRBGB", "BBBBB", "BRBGB"], [[["R", 2]], [["G", 2]], [["B", 16]]], {
    colors: "BRG",
    slots: 1,
  });
const select = (column: number): collect.Action => ({ kind: "select", column });
const settle = (s: collect.CollectSession) => {
  for (let i = 0; i < 5_000 && s.tick() !== null; i++) {
    /* run */
  }
};
const broke = (): Pouch => ({
  ...startingPouch(),
  coins: 0,
  boosters: { undo: 0, extraSlot: 0, hint: 0 },
});
const lostSession = () => {
  const s = new collect.CollectSession(fixtureB());
  s.tap(select(0));
  settle(s);
  s.tap(select(1));
  settle(s);
  expect(s.state.status).toBe("lost");
  return s;
};

describe("Undo", () => {
  it("goes back one action and spends one from stock", () => {
    const s = new collect.CollectSession(fixtureB());
    s.tap(select(0));
    const r = useUndo(startingPouch(), s, false);
    expect(r.used).toBe(true);
    expect(s.log).toHaveLength(0);
    expect(r.pouch.boosters.undo).toBe(startingPouch().boosters.undo - 1);
  });

  it("buys with coins when the stock is empty", () => {
    const s = new collect.CollectSession(fixtureB());
    s.tap(select(0));
    const r = useUndo({ ...broke(), coins: 20 }, s, false);
    expect(r.used).toBe(true);
    expect(r.pouch.coins).toBe(20 - PRICES.undo);
  });

  it("when the player cannot pay, nothing changes and Retry is mentioned", () => {
    const s = new collect.CollectSession(fixtureB());
    s.tap(select(0));
    const r = useUndo(broke(), s, false);
    expect(r.used).toBe(false);
    expect(r.pouch).toEqual(broke());
    expect(s.log).toHaveLength(1);
    expect(r.message).toMatch(/Retry is always free/);
  });

  it("charges nothing when there is nothing to undo, or in the tutorial", () => {
    const fresh = new collect.CollectSession(fixtureB());
    expect(useUndo(startingPouch(), fresh, false)).toMatchObject({ used: false });
    const s = new collect.CollectSession(fixtureB());
    s.tap(select(0));
    const r = useUndo(broke(), s, true);
    expect(r.used).toBe(true);
    expect(r.pouch).toEqual(broke());
  });
});

describe("Extra Slot", () => {
  it("adds a slot for the level and charges once", () => {
    const s = new collect.CollectSession(fixtureB());
    const r = useExtraSlot(startingPouch(), s, false);
    expect(r.used).toBe(true);
    expect(s.state.slots).toHaveLength(2);
    expect(r.pouch.boosters.extraSlot).toBe(0);
  });

  it("revives a slots-full loss", () => {
    const s = lostSession();
    const r = useExtraSlot(startingPouch(), s, false);
    expect(r.used).toBe(true);
    expect(s.state.status).toBe("playing");
    expect(r.message).toMatch(/goes on/);
  });

  it("is capped per level and never charged when refused", () => {
    const s = new collect.CollectSession(fixtureB());
    let pouch: Pouch = { ...startingPouch(), coins: 500 };
    for (let i = 0; i < MAX_EXTRA_SLOTS; i++) pouch = useExtraSlot(pouch, s, false).pouch;
    const before = pouch;
    const r = useExtraSlot(pouch, s, false);
    expect(r.used).toBe(false);
    expect(r.pouch).toBe(before);
    expect(s.state.slots).toHaveLength(1 + MAX_EXTRA_SLOTS);
  });

  it("is refused on a won game without charge", () => {
    const s = new collect.CollectSession(
      board(["RRR"], [[["R", 2]], [["R", 1]]], { colors: "R", slots: 2, squad: 1, spawnGap: 1 }),
    );
    s.tap(select(0));
    settle(s);
    s.tap(select(1));
    settle(s);
    expect(s.state.status).toBe("won");
    expect(useExtraSlot(startingPouch(), s, false)).toMatchObject({ used: false });
  });

  it("cannot be bought without coins", () => {
    const s = lostSession();
    const r = useExtraSlot(broke(), s, false);
    expect(r.used).toBe(false);
    expect(s.state.status).toBe("lost");
  });
});

describe("Hint", () => {
  it("names a legal move and charges for it", () => {
    const s = new collect.CollectSession(fixtureB());
    const r = useHint(startingPouch(), s, false);
    expect(r.used).toBe(true);
    expect(r.suggest).toBeDefined();
    expect(s.check(r.suggest!)).toBe("ok");
    expect(r.pouch.boosters.hint).toBe(startingPouch().boosters.hint - 1);
  });

  it("does not touch the game", () => {
    const s = new collect.CollectSession(fixtureB());
    const before = collect.hashState(s.state);
    useHint(startingPouch(), s, false);
    expect(collect.hashState(s.state)).toBe(before);
    expect(s.log).toHaveLength(0);
  });

  it("costs nothing once the game is over", () => {
    const r = useHint(startingPouch(), lostSession(), false);
    expect(r.used).toBe(false);
    expect(r.pouch).toEqual(startingPouch());
  });

  it("is free in the tutorial", () => {
    const s = new collect.CollectSession(fixtureB());
    expect(useHint(broke(), s, true).pouch).toEqual(broke());
  });
});

describe("refusals that must cost nothing", () => {
  it("Extra Slot after a deadlock is refused without charge or cap use", () => {
    const s = new collect.CollectSession(fixtureB());
    s.tap(select(0));
    settle(s);
    const dead = s.state as collect.CollectState;
    dead.status = "lost";
    dead.lossReason = "deadlock";
    const r = useExtraSlot(startingPouch(), s, false);
    expect(r.used).toBe(false);
    expect(r.pouch).toEqual(startingPouch());
    expect(s.extraSlots).toBe(0);
  });

  it("Undo after a win is refused without charge", () => {
    const s = new collect.CollectSession(
      board(["RRR"], [[["R", 2]], [["R", 1]]], { colors: "R", slots: 2, squad: 1, spawnGap: 1 }),
    );
    s.tap(select(0));
    settle(s);
    s.tap(select(1));
    settle(s);
    expect(s.state.status).toBe("won");
    const r = useUndo(startingPouch(), s, false);
    expect(r.used).toBe(false);
    expect(r.pouch).toEqual(startingPouch());
  });
});

describe("what the gameplay events are told", () => {
  it("reports how each booster was paid for", () => {
    const s = new collect.CollectSession(fixtureB());
    s.tap(select(0));
    expect(useUndo(startingPouch(), s, false).paid).toEqual({ booster: "undo", how: "owned" });
    s.tap(select(0));
    expect(useUndo({ ...broke(), coins: 99 }, s, false).paid).toEqual({
      booster: "undo",
      how: "coins",
    });
    s.tap(select(0));
    expect(useUndo(broke(), s, true).paid).toEqual({ booster: "undo", how: "free" });
    expect(useHint(startingPouch(), s, false).paid).toEqual({ booster: "hint", how: "owned" });
    expect(useExtraSlot(broke(), s, true).paid).toEqual({ booster: "extraSlot", how: "free" });
    expect(useExtraSlot(broke(), s, false).paid).toBeUndefined();
  });
});
