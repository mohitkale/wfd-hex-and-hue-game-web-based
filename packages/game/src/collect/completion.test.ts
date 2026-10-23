import { describe, expect, it } from "vitest";
import {
  effectForTheme,
  particleBudget,
  particleSeeds,
  revealProgress,
  revealTimes,
  type RevealOrder,
} from "./completion";
import {
  SPELLBOOK_KEY,
  emptySpellbook,
  isUnlocked,
  loadSpellbook,
  readSpellbook,
  parseSpellbook,
  recordWin,
  saveSpellbook,
  unlockedList,
  type KeyValueStore,
} from "./v2Spellbook";

describe("effect selection by subject", () => {
  it("each theme of the art bible has its own effect", () => {
    const ids = ["moon", "ritual", "crystal", "astrology", "familiar"].map(
      (t) => effectForTheme(t).id,
    );
    expect(ids).toEqual(["illuminate", "bubbles", "glow", "constellation", "awaken"]);
    expect(new Set(ids).size).toBe(5);
  });

  it("falls back to a plain bloom for any other theme", () => {
    expect(effectForTheme("other").id).toBe("bloom");
    expect(effectForTheme("").id).toBe("bloom");
    expect(effectForTheme("MOON").id).toBe("bloom");
  });

  it("every effect has a caption and a finite duration and particle count", () => {
    for (const t of ["moon", "ritual", "crystal", "astrology", "familiar", "other"]) {
      const e = effectForTheme(t);
      expect(e.caption.length).toBeGreaterThan(0);
      expect(e.durationMs).toBeGreaterThan(0);
      expect(e.durationMs).toBeLessThanOrEqual(2500);
      expect(e.particle.count).toBeGreaterThan(0);
    }
  });
});

describe("the reveal schedule", () => {
  const orders: RevealOrder[] = ["diagonal", "bottom-up", "radial", "top-down", "scatter"];

  it.each(orders)("%s: every cell has a time in 0..1, from 0 to exactly 1", (order) => {
    const t = revealTimes(12, 9, order);
    expect(t).toHaveLength(108);
    for (const v of t) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(Math.min(...t)).toBe(0);
    expect(Math.max(...t)).toBe(1);
  });

  it("is deterministic and follows its direction", () => {
    expect(revealTimes(10, 10, "scatter")).toEqual(revealTimes(10, 10, "scatter"));
    const diagonal = revealTimes(10, 10, "diagonal");
    expect(diagonal[0]).toBeLessThan(diagonal[99]!);
    const up = revealTimes(10, 10, "bottom-up");
    expect(up[95]).toBeLessThan(up[5]!); // bottom row before top row
    const down = revealTimes(10, 10, "top-down");
    expect(down[5]).toBeLessThan(down[95]!);
    const radial = revealTimes(11, 11, "radial");
    expect(radial[5 * 11 + 5]).toBe(0); // the centre is first
    expect(radial[0]).toBe(1);
  });

  it("copes with a one-cell picture", () => {
    for (const o of orders) expect(revealTimes(1, 1, o)).toEqual([0]);
  });
});

describe("skipping and reduced motion", () => {
  const spec = effectForTheme("moon");
  it("runs over its duration at normal motion", () => {
    expect(revealProgress(0, spec, { reduced: false, skipped: false })).toBe(0);
    expect(
      revealProgress(spec.durationMs / 2, spec, { reduced: false, skipped: false }),
    ).toBeCloseTo(0.5);
    expect(revealProgress(spec.durationMs * 3, spec, { reduced: false, skipped: false })).toBe(1);
    expect(revealProgress(-50, spec, { reduced: false, skipped: false })).toBe(0);
  });

  it("is complete at once when skipped or with reduced motion, and reduced motion has no particles", () => {
    expect(revealProgress(0, spec, { reduced: false, skipped: true })).toBe(1);
    expect(revealProgress(0, spec, { reduced: true, skipped: false })).toBe(1);
    expect(particleBudget(spec, true)).toBe(0);
    expect(particleBudget(spec, false)).toBe(spec.particle.count);
  });

  it("particle seeds are deterministic, inside the picture and born within the reveal", () => {
    for (const t of ["moon", "ritual", "crystal", "astrology", "familiar"]) {
      const e = effectForTheme(t);
      const seeds = particleSeeds(e, 30, 30);
      expect(seeds).toEqual(particleSeeds(e, 30, 30));
      expect(seeds).toHaveLength(e.particle.count);
      for (const s of seeds) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(30);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(30);
        expect(s.delayMs).toBeGreaterThanOrEqual(0);
        expect(s.delayMs).toBeLessThanOrEqual(e.durationMs);
      }
    }
  });
});

describe("the v2 Spellbook", () => {
  it("a win unlocks the picture once and later wins only count", () => {
    const first = recordWin(emptySpellbook(), "black-cat", 1000);
    expect(first.isNew).toBe(true);
    expect(isUnlocked(first.book, "black-cat")).toBe(true);
    expect(isUnlocked(first.book, "crescent-moon")).toBe(false);
    const again = recordWin(first.book, "black-cat", 2000);
    expect(again.isNew).toBe(false);
    expect(again.book.entries["black-cat"]).toEqual({ id: "black-cat", unlockedAt: 1000, wins: 2 });
    expect(first.book.entries["black-cat"]!.wins).toBe(1); // the old book is not mutated
  });

  it("lists unlocked pictures oldest first", () => {
    let book = emptySpellbook();
    book = recordWin(book, "b", 20).book;
    book = recordWin(book, "a", 10).book;
    expect(unlockedList(book).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("reads untrusted data safely: bad entries are dropped, junk gives an empty book", () => {
    expect(parseSpellbook(null)).toEqual(emptySpellbook());
    expect(parseSpellbook("x")).toEqual(emptySpellbook());
    expect(parseSpellbook({ entries: 4 })).toEqual(emptySpellbook());
    const parsed = parseSpellbook({
      entries: {
        ok: { id: "ok", unlockedAt: 5, wins: 2 },
        mismatch: { id: "other", unlockedAt: 5, wins: 1 },
        badWins: { id: "badWins", unlockedAt: 5, wins: 0 },
        badTime: { id: "badTime", unlockedAt: "now", wins: 1 },
        nope: null,
      },
    });
    expect(Object.keys(parsed.entries)).toEqual(["ok"]);
  });

  function memory(): KeyValueStore & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  }

  it("round-trips through storage", () => {
    const store = memory();
    const book = recordWin(emptySpellbook(), "libra-scales", 77).book;
    expect(saveSpellbook(store, book)).toBe(true);
    expect(store.data.has(SPELLBOOK_KEY)).toBe(true);
    expect(loadSpellbook(store)).toEqual(book);
  });

  it("never throws when storage is missing, broken or full: a win is just not remembered", () => {
    expect(loadSpellbook(null)).toEqual(emptySpellbook());
    expect(saveSpellbook(null, emptySpellbook())).toBe(false);
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadSpellbook(broken)).toEqual(emptySpellbook());
    expect(saveSpellbook(broken, emptySpellbook())).toBe(false);
    const corrupt = memory();
    corrupt.data.set(SPELLBOOK_KEY, "{not json");
    expect(loadSpellbook(corrupt)).toEqual(emptySpellbook());

    // A book that could not be read is flagged, so the caller never overwrites what it failed to read.
    expect(readSpellbook(corrupt).ok).toBe(false);
    expect(readSpellbook(broken).ok).toBe(false);
    expect(readSpellbook(null).ok).toBe(false);
    expect(readSpellbook(memory()).ok).toBe(true);
    expect(
      parseSpellbook(
        JSON.parse('{"entries":{"__proto__":{"id":"__proto__","unlockedAt":1,"wins":1}}}'),
      ).entries,
    ).toEqual({});
  });
});
