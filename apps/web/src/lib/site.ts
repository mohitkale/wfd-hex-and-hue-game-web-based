import { CHAPTERS, JOURNEY, type JourneyEntry } from "@hexhue/game/journey";
import type { ArtLike } from "./images";

export const SITE = {
  name: "Hex & Hue",
  fullName: "Hex & Hue: Magic Pixel Puzzle",
  tagline: "A Little Magic in Every Color",
  description:
    "A free, cozy, magical pixel puzzle. Pick a box, send your familiars to fetch every cube of " +
    "its colour, and walk a witch's journey of 24 pictures, from a first candle to your own " +
    "grimoire. No timers, no lives, no paywalls.",
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

/** Every journey picture as drawn (palette and cells), by level id: built once per build. */
const pictures = new Map<string, { entry: JourneyEntry; art: ArtLike; lore: string }>();
export function journeyPictures(): { entry: JourneyEntry; art: ArtLike; lore: string }[] {
  if (pictures.size === 0)
    for (const entry of JOURNEY) {
      const level = entry.base();
      pictures.set(entry.id, { entry, art: level, lore: level.subject?.lore ?? "" });
    }
  return [...pictures.values()];
}

/** Every picture of the witch's journey, grouped by chapter, in play order. */
export function gallery(): GalleryWorld[] {
  const all = journeyPictures();
  return CHAPTERS.map((name, ci) => ({
    id: `chapter-${ci + 1}`,
    name: `Chapter ${ci + 1}: ${name}`,
    items: all
      .filter((p) => p.entry.chapter === ci + 1)
      .map((p, i) => ({
        id: p.entry.id,
        name: p.entry.name,
        lore: p.lore,
        world: name,
        worldId: `chapter-${ci + 1}`,
        number: i + 1,
        width: p.art.width,
        height: p.art.height,
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
/** Pages for the owner only (direct link, never listed or indexed): the board designs review. */
export const HIDDEN_PAGES: readonly string[] = ["/designs/"];

export function sitemapPaths(files: readonly string[]): string[] {
  return files
    .map((f) => f.replace(/^\.\//, "/").replace(/\.(astro|md)$/, ""))
    .filter((p) => !p.includes("[") && !p.endsWith("/404"))
    .filter((p) => !HIDDEN_PAGES.includes(`${p.replace(/\/index$/, "")}/`))
    .map((p) => (p.endsWith("/index") ? p.slice(0, -"index".length) : p))
    .map((p) => (p.endsWith("/") ? p : `${p}/`))
    .sort();
}
