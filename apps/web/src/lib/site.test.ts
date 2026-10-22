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

  it("the gallery lists all 60 mosaics by world, numbered from 1", () => {
    const worlds = gallery();
    expect(worlds.map((w) => w.items.length)).toEqual([20, 20, 20]);
    expect(worlds[0]!.items[0]).toMatchObject({
      id: "moonlit-01",
      number: 1,
      world: "Moonlit Beginnings",
    });
    expect(new Set(worlds.flatMap((w) => w.items.map((i) => i.id))).size).toBe(60);
  });
});
