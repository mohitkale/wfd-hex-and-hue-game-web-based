import { checkDeck, questionFor } from "@hexhue/learn";
import { describe, expect, it } from "vitest";
import { DECKS } from "./index";

describe("the Grimoire decks", () => {
  it.each(DECKS.map((d) => [d.id, d] as const))("%s passes every content rule", (_, deck) => {
    expect(checkDeck(deck)).toEqual([]);
  });

  it("can ask a question about every card with any seed", () => {
    for (const deck of DECKS) {
      for (const card of deck.cards) {
        for (let seed = 0; seed < 20; seed++) {
          expect(questionFor(deck, card.id, seed), `${deck.id}/${card.id}/${seed}`).not.toBeNull();
        }
      }
    }
  });
});
