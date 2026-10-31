import type { GrimoireEntry } from "@hexhue/learn";
import { describe, expect, it } from "vitest";
import { GRIMOIRE, lessonsByBranch, lessonUrl } from "./grimoire";

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

  it("puts every lesson under its directory URL", () => {
    expect(lessonUrl("four-elements")).toBe("/grimoire/four-elements/");
  });
});
