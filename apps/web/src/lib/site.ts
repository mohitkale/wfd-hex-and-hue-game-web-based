import { worlds } from "@hexhue/game/levels";

export const SITE = {
  name: "Hex & Hue",
  fullName: "Hex & Hue: Magic Pixel Puzzle",
  tagline: "A Little Magic in Every Color",
  description:
    "A free, cozy, magical color-sorting pixel puzzle. Summon wisps, collect every fragment and " +
    "fill your Spellbook with moon, crystal and zodiac art. No timers, no lives, no paywalls.",
} as const;

export interface GalleryItem {
  id: string;
  name: string;
  lore: string;
  world: string;
  worldId: string;
  /** 1-based number within its world. */
  number: number;
  width: number;
  height: number;
}

export interface GalleryWorld {
  id: string;
  name: string;
  items: GalleryItem[];
}

/** Every shipped mosaic, grouped by world, in play order. */
export function gallery(): GalleryWorld[] {
  return worlds.map((w) => ({
    id: w.id,
    name: w.name,
    items: w.levels.map((l, i) => ({
      id: l.level.id,
      name: l.level.name,
      lore: l.lore,
      world: w.name,
      worldId: w.id,
      number: i + 1,
      width: l.level.width,
      height: l.level.height,
    })),
  }));
}

/** URL of a mosaic's artwork image (generated at build time by pages/art/[id].png.ts). */
export const artUrl = (id: string) => `/art/${id}.png`;

/** Used when no site URL is configured (local builds); see astro.config.mjs. */
export const PLACEHOLDER_SITE = "https://hexandhue.example";

/** Absolute URL for `path` on the configured site (canonical links, share cards). */
export function absolute(path: string, site: URL | undefined): string {
  return new URL(path, site ?? PLACEHOLDER_SITE).toString();
}

/** A mosaic's 1200×630 share card (pages/og/[id].png.ts), for posts that feature it. */
export const ogCardUrl = (id: string) => `/og/${id}.png`;

/**
 * Sitemap paths from page module paths ("./faq.astro", "./blog/index.astro"…): dynamic routes and
 * the 404 page left out, every page in its canonical directory form ("/faq/").
 */
export function sitemapPaths(files: readonly string[]): string[] {
  return files
    .map((f) => f.replace(/^\.\//, "/").replace(/\.(astro|md)$/, ""))
    .filter((p) => !p.includes("[") && !p.endsWith("/404"))
    .map((p) => (p.endsWith("/index") ? p.slice(0, -"index".length) : p))
    .map((p) => (p.endsWith("/") ? p : `${p}/`))
    .sort();
}
