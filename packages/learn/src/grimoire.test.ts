import { describe, expect, it } from "vitest";
import {
  checkEntry,
  checkLibrary,
  closedTermsIn,
  hasFlame,
  visibleEntries,
  type GrimoireEntry,
} from "./grimoire";
import type { Lesson } from "./lesson";

const lesson: Lesson = {
  id: "candle-test",
  title: "A candle",
  branch: "elements",
  minutes: 2,
  intro: "Light a candle with care.",
  steps: [
    {
      id: "rosemary",
      prompt: "Lay a sprig of rosemary by the candle.",
      expects: [{ kind: "place", item: "rosemary", spot: "altar" }],
      order: "in-order",
      hint: "The rosemary goes on the altar.",
      why: "Rosemary is a herb of remembrance.",
    },
    {
      id: "light",
      prompt: "Light the candle.",
      expects: [{ kind: "light", item: "candle" }],
      order: "in-order",
      hint: "Tap the wick.",
      why: "The flame marks the start.",
    },
  ],
};

const entry: GrimoireEntry = {
  lesson,
  topics: ["candle", "herbs"],
  safety: {
    fire: "Never leave a flame alone; keep it clear of hair, cloth and paper.",
    herbs: [{ item: "rosemary", name: "Rosemary", safety: "kitchen-safe" }],
    tools: ["candle"],
  },
  review: { status: "reviewed", by: "A. Practitioner", date: "2026-11-01" },
};

describe("checkEntry", () => {
  it("passes a sound, reviewed entry", () => {
    expect(checkEntry(entry)).toEqual([]);
  });

  it("needs fire safety whenever there is a flame", () => {
    const noFire = { ...entry, safety: { ...entry.safety, fire: " " } };
    expect(checkEntry(noFire)).toContain("a lesson with a flame needs fire safety");
    // A light step alone is enough, even without a candle or fire topic.
    const quiet: GrimoireEntry = { ...noFire, topics: ["herbs"] };
    expect(hasFlame(quiet)).toBe(true);
    expect(checkEntry(quiet)).toContain("a lesson with a flame needs fire safety");
  });

  it("needs a safety badge on every herb and never handles a toxic one", () => {
    expect(checkEntry({ ...entry, safety: { fire: "Care." } })).toContain(
      'a "herbs" lesson must list its herbs with safety badges',
    );
    const toxic: GrimoireEntry = {
      ...entry,
      safety: {
        fire: "Care.",
        tools: ["candle"],
        herbs: [
          { item: "rosemary", name: "Rosemary", safety: "do-not-use" },
          { item: "x", name: "", safety: "nope" as "kitchen-safe" },
        ],
      },
    };
    expect(checkEntry(toxic)).toEqual([
      'herb "rosemary" is marked do-not-use but a step handles it',
      'herb "x" has no safety badge',
      'herb "x" has no name',
    ]);
  });

  it("never teaches a toxic herb as an answer", () => {
    const quiz: GrimoireEntry = {
      ...entry,
      topics: ["herbs"],
      lesson: {
        ...lesson,
        steps: [
          {
            ...lesson.steps[0]!,
            expects: [{ kind: "choose", option: "foxglove" }],
          },
        ],
      },
      safety: { herbs: [{ item: "foxglove", name: "Foxglove", safety: "do-not-use" }] },
    };
    expect(checkEntry(quiz)).toEqual([
      'herb "foxglove" is marked do-not-use but a step handles it',
    ]);
  });

  it("badges every herb a herbs-and-stones lesson handles, whatever its topics", () => {
    const sneaky: GrimoireEntry = {
      ...entry,
      topics: ["crystals"],
      lesson: {
        ...lesson,
        branch: "herbs-stones",
        steps: [
          {
            ...lesson.steps[0]!,
            expects: [{ kind: "place", item: "mugwort", spot: "bowl" }],
          },
        ],
      },
      safety: { tools: ["quartz"] },
    };
    expect(checkEntry(sneaky)).toEqual([
      '"mugwort" is neither a listed herb (with a safety badge) nor a listed tool',
    ]);
  });

  it("treats a flame item as a flame without a candle topic", () => {
    const incense: GrimoireEntry = {
      ...entry,
      topics: ["meditation"],
      lesson: {
        ...lesson,
        steps: [
          {
            ...lesson.steps[0]!,
            expects: [{ kind: "place", item: "incense-stick", spot: "east" }],
          },
        ],
      },
      safety: {},
    };
    expect(hasFlame(incense)).toBe(true);
    expect(checkEntry(incense)).toEqual(["a lesson with a flame needs fire safety"]);
  });

  it("reads action ids for closed practices too", () => {
    const ids: GrimoireEntry = {
      ...entry,
      lesson: {
        ...lesson,
        steps: [
          { ...lesson.steps[0]!, expects: [{ kind: "place", item: "white-sage", spot: "altar" }] },
          lesson.steps[1]!,
        ],
      },
      safety: {
        ...entry.safety,
        herbs: [{ item: "white-sage", name: "Sage", safety: "external-only" }],
      },
    };
    expect(checkEntry(ids)).toEqual([
      'mentions "white sage", a closed practice the Grimoire does not teach',
    ]);
  });

  it("refuses closed practices anywhere in the text", () => {
    const steps = [{ ...lesson.steps[0]!, why: "Some use it in Hoodoo and in smudging." }];
    const closed = { ...entry, lesson: { ...lesson, steps: [...steps, lesson.steps[1]!] } };
    expect(checkEntry(closed)).toEqual([
      'mentions "hoodoo", a closed practice the Grimoire does not teach',
      'mentions "smudging", a closed practice the Grimoire does not teach',
    ]);
  });

  it("checks topics and the review record", () => {
    const bad = {
      ...entry,
      topics: ["gardening" as "herbs"],
      review: { status: "reviewed", by: "", date: "1 Nov" },
    } as const;
    expect(checkEntry(bad)).toEqual([
      'unknown topic "gardening"',
      "a reviewed lesson must name its reviewer",
      "review date must be YYYY-MM-DD",
    ]);
    expect(checkEntry({ ...entry, topics: [] })).toContain("entry has no topics");
    const none = { ...entry, review: {} as GrimoireEntry["review"] };
    expect(checkEntry(none)).toContain("entry has no review record");
  });

  it("includes the lesson's structural problems", () => {
    expect(checkEntry({ ...entry, lesson: { ...lesson, title: "" } })).toContain(
      "lesson has no title",
    );
  });
});

describe("closedTermsIn", () => {
  it("matches whole words, ignoring case and accents", () => {
    expect(closedTermsIn("Santería and VOODOO")).toEqual(["voodoo", "santeria"]);
    expect(closedTermsIn("a burning bundle of white sage")).toEqual(["white sage"]);
    expect(closedTermsIn("a smudged page and white_sage")).toEqual(["smudged", "white sage"]);
    expect(closedTermsIn("a floating balloon, a loaf, lawn")).toEqual([]);
  });
});

describe("library", () => {
  const draft: GrimoireEntry = {
    ...entry,
    lesson: { ...lesson, id: "draft" },
    review: { status: "draft" },
  };

  it("finds duplicate ids and prefixes problems with the lesson id", () => {
    expect(checkLibrary([entry, entry])).toEqual(["candle-test: duplicate lesson id"]);
    const broken = { ...draft, topics: [] };
    expect(checkLibrary([broken])).toEqual(["draft: entry has no topics"]);
  });

  it("shows drafts only in preview", () => {
    expect(visibleEntries([entry, draft], false)).toEqual([entry]);
    expect(visibleEntries([entry, draft], true)).toEqual([entry, draft]);
  });
});
