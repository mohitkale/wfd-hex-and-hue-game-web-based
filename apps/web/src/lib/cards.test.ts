import { answerCard, type Deck } from "@hexhue/learn";
import { describe, expect, it } from "vitest";
import { GEM, LEAF, cardSvg, shade } from "./cardArt";
import { CARDS_KEY, loadDeckProgress, storeDeckProgress } from "./cardStore";

const deck: Deck = {
  id: "d",
  name: "D",
  intro: "",
  kind: "crystals",
  review: { status: "draft" },
  cards: [{ id: "a", name: "A", uses: ["x", "y"], lore: "l", color: "#808080" }],
};

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe("card store", () => {
  it("keeps each deck's progress under one key, other decks untouched", () => {
    const store = memory();
    store.data.set(CARDS_KEY, JSON.stringify({ other: { z: 1 } }));
    const p = answerCard({}, "a", true, "2026-11-01");
    expect(storeDeckProgress(deck, p, store)).toBe(true);
    expect(loadDeckProgress(deck, store)).toEqual(p);
    expect(JSON.parse(store.data.get(CARDS_KEY)!).other).toEqual({ z: 1 });
  });

  it("never throws on broken or missing storage", () => {
    const store = memory();
    store.data.set(CARDS_KEY, "{bad");
    expect(loadDeckProgress(deck, store)).toEqual({});
    expect(loadDeckProgress(deck, null)).toEqual({});
    expect(storeDeckProgress(deck, {}, null)).toBe(false);
  });
});

describe("card art", () => {
  it("draws tidy grids tinted with the card's colour", () => {
    for (const row of [...GEM, ...LEAF]) expect(row).toMatch(/^[.kcld]{10}$/);
    expect(cardSvg("crystals", "#808080")).toContain("#808080");
    expect(shade("#808080", 0.5)).toBe("#ffffff");
    expect(shade("#808080", -1)).toBe("#000000");
  });
});
