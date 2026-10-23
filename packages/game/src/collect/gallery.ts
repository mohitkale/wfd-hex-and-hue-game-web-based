import { artLevelForPiece, ART_PIECE_IDS } from "./artLevels";
import { WORLD_IDENTITIES, WORLD_IDS, worldForTheme, type WorldId } from "./worldIdentity";
import { isUnlocked, type V2Spellbook } from "./v2Spellbook";

/**
 * The v2 Spellbook as a gallery (M13.2): every picture of the library grouped by its world, each
 * collected or still a silhouette, and for a collected one a page with the finished illustration,
 * name, lore and a way to play it again. Pure data over the Spellbook, so it is tested without Phaser.
 */

export interface GalleryCard {
  pieceId: string;
  /** The playable level id (`art-<piece id>`), used to replay it. */
  levelId: string;
  collected: boolean;
  /** Shown only once collected: a silhouette must not give the picture's name away. */
  name: string | null;
}

export interface GallerySection {
  world: WorldId;
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

/** Pieces of a theme no world claims (`other`) are shown last, in their own section. */
const UNCLAIMED = "unclaimed" as const;

export function buildGallery(
  book: V2Spellbook,
  pieceIds: readonly string[] = ART_PIECE_IDS,
): Gallery {
  const byWorld = new Map<WorldId | typeof UNCLAIMED, GalleryCard[]>();
  for (const pieceId of pieceIds) {
    const level = artLevelForPiece(pieceId);
    const subject = level?.subject;
    if (!level || !subject) continue;
    const world = worldForTheme(subject.theme) ?? UNCLAIMED;
    const collected = isUnlocked(book, pieceId);
    const list = byWorld.get(world) ?? [];
    list.push({ pieceId, levelId: level.id, collected, name: collected ? subject.name : null });
    byWorld.set(world, list);
  }
  const sections: GallerySection[] = [];
  for (const id of [...WORLD_IDS, UNCLAIMED] as const) {
    const cards = byWorld.get(id);
    if (!cards || cards.length === 0) continue;
    const identity = id === UNCLAIMED ? null : WORLD_IDENTITIES[id];
    sections.push({
      world: (id === UNCLAIMED ? "moonlit" : id) as WorldId,
      name: identity?.name ?? "Other pages",
      tagline: identity?.tagline ?? "",
      cards,
      collected: cards.filter((c) => c.collected).length,
    });
  }
  const all = sections.flatMap((s) => s.cards);
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
  const level = artLevelForPiece(pieceId);
  const subject = level?.subject;
  if (!entry || !level || !subject) return null;
  const world = worldForTheme(subject.theme);
  return {
    pieceId,
    levelId: level.id,
    name: subject.name,
    lore: subject.lore,
    worldName: world ? WORLD_IDENTITIES[world].name : "Other pages",
    completions: entry.wins === 1 ? "Completed once" : `Completed ${entry.wins} times`,
    firstOn: formatDay(entry.unlockedAt),
  };
}
