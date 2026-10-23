import { describe, expect, it } from "vitest";
import { ART_PIECE_IDS } from "./artLevels";
import { levelFromSearch } from "./levels";
import { buildGallery, formatDay, pageFor } from "./gallery";
import { emptySpellbook, recordWin } from "./v2Spellbook";
import { WORLD_IDENTITIES } from "./worldIdentity";

/** M13.2: the gallery groups the library by world, hides what is not collected, and offers replay. */

describe("the gallery", () => {
  it("groups every library piece by its world, in world order, and counts none collected on a new book", () => {
    const g = buildGallery(emptySpellbook());
    expect(g.total).toBe(ART_PIECE_IDS.length);
    expect(g.collected).toBe(0);
    expect(g.sections.map((s) => s.name)).toEqual([
      WORLD_IDENTITIES.moonlit.name,
      WORLD_IDENTITIES.crystal.name,
      WORLD_IDENTITIES.zodiac.name,
    ]);
    const ids = g.sections.flatMap((s) => s.cards.map((c) => c.pieceId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([...ART_PIECE_IDS].sort());
    // Moonlit holds the moons and the cauldron; Crystal the crystal and the cat; Zodiac the scales.
    const of = (name: string) =>
      g.sections
        .find((s) => s.name === name)!
        .cards.map((c) => c.pieceId)
        .sort();
    expect(of(WORLD_IDENTITIES.moonlit.name)).toEqual([
      "crescent-moon",
      "triple-moon",
      "witchs-cauldron",
    ]);
    expect(of(WORLD_IDENTITIES.crystal.name)).toEqual(["amethyst-cluster", "black-cat"]);
    expect(of(WORLD_IDENTITIES.zodiac.name)).toEqual(["libra-scales"]);
  });

  it("a silhouette gives nothing away; a collected picture shows its name", () => {
    let book = emptySpellbook();
    book = recordWin(book, "black-cat", 1_700_000_000_000).book;
    const g = buildGallery(book);
    const cards = g.sections.flatMap((s) => s.cards);
    for (const c of cards) {
      if (c.pieceId === "black-cat") expect([c.collected, c.name]).toEqual([true, "Black Cat"]);
      else expect([c.collected, c.name]).toEqual([false, null]);
    }
    expect(g.collected).toBe(1);
    expect(g.sections.find((s) => s.name === WORLD_IDENTITIES.crystal.name)!.collected).toBe(1);
    expect(g.sections.find((s) => s.name === WORLD_IDENTITIES.moonlit.name)!.collected).toBe(0);
  });

  it("each card knows the level that replays it", () => {
    for (const c of buildGallery(emptySpellbook()).sections.flatMap((s) => s.cards)) {
      expect(c.levelId).toBe(`art-${c.pieceId}`);
    }
  });

  it("ignores a book entry for a picture that is not in the library", () => {
    const book = recordWin(emptySpellbook(), "no-such-piece", 5).book;
    const g = buildGallery(book);
    expect(g.collected).toBe(0);
    expect(g.total).toBe(ART_PIECE_IDS.length);
  });

  it("an empty list of pieces gives an empty gallery", () => {
    expect(buildGallery(emptySpellbook(), [])).toEqual({ sections: [], collected: 0, total: 0 });
  });
});

describe("a page", () => {
  it("is null until the picture is collected", () => {
    expect(pageFor(emptySpellbook(), "libra-scales")).toBeNull();
    expect(
      pageFor(recordWin(emptySpellbook(), "libra-scales", 1).book, "no-such-piece"),
    ).toBeNull();
  });

  it("shows the name, lore, world, completions, first date and the level to replay", () => {
    let book = recordWin(emptySpellbook(), "libra-scales", Date.UTC(2026, 9, 23, 18, 30)).book;
    const once = pageFor(book, "libra-scales")!;
    expect(once).toMatchObject({
      pieceId: "libra-scales",
      levelId: "art-libra-scales",
      name: "Libra, the Scales",
      worldName: "Zodiac Realm",
      completions: "Completed once",
      firstOn: "2026-10-23",
    });
    expect(once.lore.length).toBeGreaterThan(10);
    book = recordWin(book, "libra-scales", Date.UTC(2026, 10, 2)).book;
    const twice = pageFor(book, "libra-scales")!;
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
