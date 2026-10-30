import { describe, expect, it } from "vitest";
import { CHAPTERS, JOURNEY } from "./journey";
import { levelFromSearch } from "./levels";
import { buildGallery, formatDay, pageFor } from "./gallery";
import { emptySpellbook, recordWin } from "./v2Spellbook";

/** M13.2 (journey since M15.13): the gallery groups the pictures by chapter, hides what is not collected, and offers replay. */

describe("the gallery", () => {
  it("groups the journey's pictures by chapter, in order, and counts none collected on a new book", () => {
    const g = buildGallery(emptySpellbook());
    expect(g.total).toBe(24);
    expect(g.collected).toBe(0);
    expect(g.sections.map((s) => s.name)).toEqual(
      CHAPTERS.map((name, i) => `Chapter ${i + 1}: ${name}`),
    );
    expect(g.sections.map((s) => s.cards.length)).toEqual([4, 4, 4, 4, 4, 4]);
    const ids = g.sections.flatMap((s) => s.cards.map((c) => c.levelId));
    expect(ids).toEqual(JOURNEY.map((e) => e.id));
    for (const s of g.sections) expect(s.tagline.length).toBeGreaterThan(10);
  });

  it("a silhouette gives nothing away; a collected picture shows its name", () => {
    let book = emptySpellbook();
    book = recordWin(book, "blessed-cat", 1_700_000_000_000).book;
    const g = buildGallery(book);
    const cards = g.sections.flatMap((s) => s.cards);
    for (const c of cards) {
      if (c.pieceId === "blessed-cat") expect([c.collected, c.name]).toEqual([true, "Blessed Be"]);
      else expect([c.collected, c.name]).toEqual([false, null]);
    }
    expect(g.collected).toBe(1);
    expect(g.sections[0]!.collected).toBe(1);
    expect(g.sections[1]!.collected).toBe(0);
  });

  it("each card knows the level that replays it", () => {
    for (const c of buildGallery(emptySpellbook()).sections.flatMap((s) => s.cards)) {
      expect(c.levelId).toBe(`j-${c.pieceId}`);
    }
  });

  it("ignores a book entry for a picture that is not on the journey", () => {
    const book = recordWin(emptySpellbook(), "no-such-piece", 5).book;
    const g = buildGallery(book);
    expect(g.collected).toBe(0);
    expect(g.total).toBe(24);
  });

  it("an empty list of levels gives an empty gallery", () => {
    expect(buildGallery(emptySpellbook(), [])).toEqual({ sections: [], collected: 0, total: 0 });
  });
});

describe("a page", () => {
  it("is null until the picture is collected", () => {
    expect(pageFor(emptySpellbook(), "raven")).toBeNull();
    expect(pageFor(recordWin(emptySpellbook(), "raven", 1).book, "no-such-piece")).toBeNull();
  });

  it("shows the name, lore, chapter, completions, first date and the level to replay", () => {
    let book = recordWin(emptySpellbook(), "raven", Date.UTC(2026, 9, 23, 18, 30)).book;
    const once = pageFor(book, "raven")!;
    expect(once).toMatchObject({
      pieceId: "raven",
      levelId: "j-raven",
      name: "Raven",
      worldName: "Chapter 5: Familiars & Spirits",
      completions: "Completed once",
      firstOn: "2026-10-23",
    });
    expect(once.lore.length).toBeGreaterThan(10);
    book = recordWin(book, "raven", Date.UTC(2026, 10, 2)).book;
    const twice = pageFor(book, "raven")!;
    expect(twice.completions).toBe("Completed 2 times");
    expect(twice.firstOn).toBe("2026-10-23"); // the first win, not the latest
  });

  it("formats days in UTC and survives nonsense", () => {
    expect(formatDay(0)).toBe("1970-01-01");
    expect(formatDay(Number.NaN)).toBe("");
    expect(formatDay(Number.POSITIVE_INFINITY)).toBe("");
    expect(formatDay(1e20)).toBe("");
  });
});

describe("replay", () => {
  it("a level chosen in the game wins over the address bar; none falls back to it", () => {
    expect(levelFromSearch("?level=art-black-cat", "art-libra-scales").id).toBe("art-libra-scales");
    expect(levelFromSearch("?level=art-black-cat").id).toBe("art-black-cat");
    expect(levelFromSearch("?level=art-black-cat", null).id).toBe("art-black-cat");
    expect(levelFromSearch("", "no-such-level").id).toBe(levelFromSearch("").id);
    // An unknown choice falls through to the address bar rather than to the default level.
    expect(levelFromSearch("?level=art-black-cat", "no-such-level").id).toBe("art-black-cat");
  });

  it("every card's level id is playable", () => {
    for (const c of buildGallery(emptySpellbook()).sections.flatMap((s) => s.cards))
      expect(levelFromSearch("", c.levelId).id).toBe(c.levelId);
  });
});
