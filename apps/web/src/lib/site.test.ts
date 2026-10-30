import { describe, expect, it } from "vitest";
import { absolute, gallery, sitemapPaths } from "./site";

describe("site helpers", () => {
  it("lists pages in canonical directory form, without 404 or dynamic routes", () => {
    expect(
      sitemapPaths([
        "./index.astro",
        "./faq.astro",
        "./blog/index.astro",
        "./blog/moon-phases.md",
        "./404.astro",
        "./art/[id].png.ts",
      ]),
    ).toEqual(["/", "/blog/", "/blog/moon-phases/", "/faq/"]);
  });

  it("makes absolute URLs on the configured site, or the placeholder", () => {
    expect(absolute("/faq/", new URL("https://hexandhue.app"))).toBe("https://hexandhue.app/faq/");
    expect(absolute("/og.png", undefined)).toBe("https://hexandhue.example/og.png");
  });

  it("the gallery lists the journey's 24 pictures by chapter, numbered from 1", () => {
    const chapters = gallery();
    expect(chapters.map((c) => c.items.length)).toEqual([4, 4, 4, 4, 4, 4]);
    expect(chapters[0]!.items[0]).toMatchObject({
      id: "j-candle",
      number: 1,
      world: "The Calling",
    });
    expect(new Set(chapters.flatMap((c) => c.items.map((i) => i.id))).size).toBe(24);
  });
});
