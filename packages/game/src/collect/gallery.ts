import { CHAPTERS, JOURNEY, pictureLevel } from "./journey";
import { isUnlocked, type V2Spellbook } from "./v2Spellbook";

/**
 * The Spellbook as a gallery (M13.2; the witch's journey since M15.13): every journey picture grouped
 * by its chapter, each collected or still a silhouette, and for a collected one a page with the
 * finished illustration, name, lore and a way to play it again. Pure data over the Spellbook, so it is
 * tested without Phaser.
 */

export interface GalleryCard {
  /** The picture's id (the Spellbook's key, `subject.id`). */
  pieceId: string;
  /** The playable level id (`j-<picture id>`), used to replay it. */
  levelId: string;
  collected: boolean;
  /** Shown only once collected: a silhouette must not give the picture's name away. */
  name: string | null;
}

export interface GallerySection {
  /** The chapter (1-based). */
  chapter: number;
  name: string;
  tagline: string;
  cards: GalleryCard[];
  collected: number;
}

export interface Gallery {
  sections: GallerySection[];
  collected: number;
  total: number;
}

/** What each chapter is about, under its name. */
const TAGLINES: readonly string[] = [
  "First steps: a flame, a hat, a broom and a familiar.",
  "Herbs, stone and the first brew of your own.",
  "Stones that hold light, and how to charge them.",
  "Reading the sky and the moon's three faces.",
  "The friends who walk beside a witch.",
  "Symbols, cards, the turning year and your own book.",
];

export function buildGallery(book: V2Spellbook, levelIds?: readonly string[]): Gallery {
  const sections: GallerySection[] = CHAPTERS.map((name, ci) => {
    const cards = JOURNEY.filter((e) => e.chapter === ci + 1)
      .filter((e) => !levelIds || levelIds.includes(e.id))
      .map((e) => {
        const pieceId = e.id.slice(2);
        const collected = isUnlocked(book, pieceId);
        return { pieceId, levelId: e.id, collected, name: collected ? e.name : null };
      });
    return {
      chapter: ci + 1,
      name: `Chapter ${ci + 1}: ${name}`,
      tagline: TAGLINES[ci] ?? "",
      cards,
      collected: cards.filter((c) => c.collected).length,
    };
  }).filter((sec) => sec.cards.length > 0);
  const all = sections.flatMap((sec) => sec.cards);
  return { sections, collected: all.filter((c) => c.collected).length, total: all.length };
}

export interface GalleryPage {
  pieceId: string;
  levelId: string;
  name: string;
  lore: string;
  worldName: string;
  /** "Completed 3 times" / "Completed once". */
  completions: string;
  /** First completion as `YYYY-MM-DD` (UTC). */
  firstOn: string;
}

/** `YYYY-MM-DD` in UTC for an epoch-ms timestamp ("" for something that is not a date). */
export function formatDay(ms: number): string {
  return Number.isFinite(ms) && Math.abs(ms) < 8.64e15
    ? new Date(ms).toISOString().slice(0, 10)
    : "";
}

/** The page of a collected picture, or null if it is not collected (or unknown). */
export function pageFor(book: V2Spellbook, pieceId: string): GalleryPage | null {
  const entry = book.entries[pieceId];
  const level = pictureLevel(pieceId);
  const subject = level?.subject;
  const journey = JOURNEY.find((e) => e.id === level?.id);
  if (!entry || !level || !subject || !journey) return null;
  return {
    pieceId,
    levelId: level.id,
    name: subject.name,
    lore: subject.lore,
    worldName: `Chapter ${journey.chapter}: ${journey.chapterName}`,
    completions: entry.wins === 1 ? "Completed once" : `Completed ${entry.wins} times`,
    firstOn: formatDay(entry.unlockedAt),
  };
}
