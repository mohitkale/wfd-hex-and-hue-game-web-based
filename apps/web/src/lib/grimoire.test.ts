import type { GrimoireEntry } from "@hexhue/learn";
import { describe, expect, it } from "vitest";
import {
  GRIMOIRE,
  builtDecks,
  builtLessons,
  builtMoonQuests,
  isReviewed,
  lessonsByBranch,
  lessonUrl,
  previewBuild,
} from "./grimoire";

const at = (id: string, branch: GrimoireEntry["lesson"]["branch"]): GrimoireEntry => ({
  ...GRIMOIRE[0]!,
  lesson: { ...GRIMOIRE[0]!.lesson, id, branch },
});

describe("grimoire helpers", () => {
  it("groups lessons by branch in Path order, skipping empty branches", () => {
    const groups = lessonsByBranch([at("b", "moon"), at("a", "elements"), at("c", "moon")]);
    expect(groups.map((g) => [g.branch, g.entries.map((e) => e.lesson.id)])).toEqual([
      ["elements", ["a"]],
      ["moon", ["b", "c"]],
    ]);
    expect(groups[0]!.name).toBe("Elements");
  });

  it("builds drafts only in development and preview builds", () => {
    expect(previewBuild(true, undefined)).toBe(true);
    expect(previewBuild(false, "1")).toBe(true);
    expect(previewBuild(false, undefined)).toBe(false);
    expect(builtLessons(false).every(isReviewed)).toBe(true);
    expect(builtLessons(true)).toEqual(GRIMOIRE);
  });

  it("builds draft decks and moon quests only in preview", () => {
    expect(builtDecks(false).every((d) => d.review.status === "reviewed")).toBe(true);
    expect(builtDecks(true).length).toBeGreaterThan(0);
    expect(Object.keys(builtMoonQuests(true)).sort()).toHaveLength(8);
    expect(builtMoonQuests(true).full).toBe("moon-full");
  });

  it("puts every lesson under its directory URL", () => {
    expect(lessonUrl("four-elements")).toBe("/grimoire/four-elements/");
  });
});
