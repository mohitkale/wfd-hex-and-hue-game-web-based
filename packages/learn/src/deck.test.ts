import { describe, expect, it } from "vitest";
import {
  addDays,
  answerCard,
  checkDeck,
  earnedCount,
  parseDeckProgress,
  practiceRound,
  questionFor,
  type Card,
  type Deck,
} from "./deck";

const card = (id: string, uses: string[], extra: Partial<Card> = {}): Card => ({
  id,
  name: id,
  uses,
  lore: `${id} lore`,
  color: "#aabbcc",
  ...extra,
});

const deck: Deck = {
  id: "test",
  name: "Test",
  intro: "",
  kind: "crystals",
  review: { status: "draft" },
  cards: [
    card("a", ["calm", "sleep"], { element: "water" }),
    card("b", ["courage", "fire work"], { element: "fire" }),
    card("c", ["grounding", "focus"], { element: "earth" }),
    card("d", ["clarity", "focus"]),
  ],
};

describe("questions", () => {
  it("always has exactly one right answer among three", () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const c of deck.cards) {
        const q = questionFor(deck, c.id, seed)!;
        expect(q.options).toHaveLength(3);
        expect(q.options.filter((o) => o.id === q.answer)).toHaveLength(1);
        if (q.prompt.startsWith("Which element")) {
          expect(q.answer).toBe(c.element);
        } else {
          expect(q.answer).toBe(c.id);
          // No wrong answer shares the use being asked about.
          const use = c.uses.find((u) => q.prompt.includes(u))!;
          for (const o of q.options) {
            if (o.id !== c.id)
              expect(deck.cards.find((x) => x.id === o.id)!.uses).not.toContain(use);
          }
        }
      }
    }
  });

  it("never offers a card widely used for the asked use elsewhere as a wrong answer", () => {
    const wide: Deck = {
      ...deck,
      cards: [
        card("a", ["calm", "sleep"]),
        card("b", ["luck", "x"], { alsoFor: ["calm"] }),
        card("c", ["courage", "y"]),
        card("d", ["focus", "z"]),
      ],
    };
    for (let seed = 0; seed < 40; seed++) {
      const q = questionFor(wide, "a", seed)!;
      if (q.prompt.includes("calm")) expect(q.options.map((o) => o.id)).not.toContain("b");
    }
  });

  it("is the same for the same seed", () => {
    expect(questionFor(deck, "a", 7)).toEqual(questionFor(deck, "a", 7));
  });

  it("asks nothing about an unknown card", () => {
    expect(questionFor(deck, "zz", 1)).toBeNull();
  });
});

describe("earning and reviewing", () => {
  it("earns a card on its first right answer only", () => {
    let p = answerCard({}, "a", false, "2026-11-01");
    expect(p).toEqual({});
    p = answerCard(p, "a", true, "2026-11-01");
    expect(p.a).toEqual({ box: 2, due: "2026-11-02", earned: "2026-11-01" });
    expect(earnedCount(deck, p)).toBe(1);
  });

  it("moves up when right and gently down when wrong, never losing the card", () => {
    let p = answerCard({}, "a", true, "2026-11-01");
    expect(answerCard(p, "a", true, "2026-11-01")).toBe(p); // not due yet: no change
    p = answerCard(p, "a", true, "2026-11-02");
    expect(p.a).toMatchObject({ box: 3, due: "2026-11-05" });
    p = answerCard(p, "a", false, "2026-11-05");
    expect(p.a).toMatchObject({ box: 2, due: "2026-11-06", earned: "2026-11-01" });
    p = answerCard(p, "a", false, "2026-11-06");
    expect(p.a).toMatchObject({ box: 1, due: "2026-11-06" });
    p = answerCard(p, "a", false, "2026-11-06");
    expect(p.a).toMatchObject({ box: 1 });
    let day = "2026-11-06";
    for (let i = 0; i < 9; i++) {
      p = answerCard(p, "a", true, day);
      day = p.a!.due;
    }
    expect(p.a!.box).toBe(5);
    expect(answerCard(p, "a", true, "bad day")).toBe(p);
  });

  it("practises due cards first, then new ones", () => {
    let p = answerCard({}, "c", true, "2026-11-01"); // due 11-02
    p = answerCard(p, "b", true, "2026-10-30"); // due 10-31
    expect(practiceRound(deck, p, "2026-11-02", 3)).toEqual(["b", "c", "a"]);
    expect(practiceRound(deck, p, "2026-11-01", 6)).toEqual(["b", "a", "d"]);
  });

  it("offers a short round even when nothing is due", () => {
    let p = {};
    for (const c of deck.cards) p = answerCard(p, c.id, true, "2026-11-01");
    expect(practiceRound(deck, p, "2026-11-01")).toHaveLength(3);
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("parses stored progress defensively", () => {
    expect(
      parseDeckProgress(
        {
          a: { box: 3, due: "2026-11-05", earned: "2026-11-01" },
          b: { box: 9, due: "2026-11-05", earned: "2026-11-01" },
          gone: { box: 1, due: "2026-11-05", earned: "2026-11-01" },
          c: "x",
        },
        deck,
      ),
    ).toEqual({ a: { box: 3, due: "2026-11-05", earned: "2026-11-01" } });
    expect(parseDeckProgress(null, deck)).toEqual({});
  });
});

describe("checkDeck", () => {
  it("passes a sound deck", () => {
    expect(checkDeck(deck)).toEqual([]);
  });

  it("needs safety badges on herbs and enough variety to ask", () => {
    const herbs: Deck = {
      ...deck,
      kind: "herbs",
      cards: [
        card("x", ["calm", "sleep"], { safety: "kitchen-safe" }),
        card("y", ["calm", "love"]),
        card("z", ["calm", "luck"], { safety: "do-not-use", color: "red" }),
      ],
    };
    expect(checkDeck(herbs)).toEqual([
      'card "x": too many cards share "calm" to ask about it',
      'card "y" has no safety badge',
      'card "y": too many cards share "calm" to ask about it',
      'card "z" has a bad colour',
      'card "z" is toxic: it cannot be a match answer',
      'card "z": too many cards share "calm" to ask about it',
    ]);
  });

  it("refuses closed practices and thin decks", () => {
    const bad: Deck = {
      ...deck,
      cards: [card("a", ["smudging", "x"]), card("b", ["y", "z"])],
      review: { status: "reviewed", by: " ", date: "2026-11-01" },
    };
    expect(checkDeck(bad)).toEqual([
      "a deck needs at least three cards",
      'card "a": too many cards share "smudging" to ask about it',
      'card "a": too many cards share "x" to ask about it',
      'card "a" mentions "smudging", a closed practice the Grimoire does not teach',
      'card "b": too many cards share "y" to ask about it',
      'card "b": too many cards share "z" to ask about it',
      "a reviewed deck must name its reviewer",
    ]);
  });
});
