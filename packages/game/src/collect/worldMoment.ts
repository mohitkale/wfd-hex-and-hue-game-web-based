import { buildGallery } from "./gallery";
import { JOURNEY, pictureLevel } from "./journey";
import { WORLD_IDENTITIES, WORLD_IDS, worldForTheme, type SealKind } from "./worldIdentity";
import type { V2Spellbook } from "./v2Spellbook";

/**
 * The world's part of a completion (M13.3): which world the picture belongs to, how far you are
 * through its pages, and the seal that marks it. Pure and free of Phaser, like `completion.ts`: it is
 * presentation only, and every part of it is skipped with the reveal or by reduced motion.
 */

export interface WorldMoment {
  worldName: string;
  /** "First page of …", "… · 2 of 3 pages" or "… : every page so far". */
  line: string;
  seal: { kind: SealKind; color: number };
  /** The world's backdrop colour, tinting the end card's shade. */
  backdrop: number;
}

/**
 * The moment for a win of `pieceId`, given the Spellbook *after* it was recorded and whether this win
 * collected the picture: its chapter of the journey and how far you are through it. The seal and
 * backdrop come from the picture's theme. Null for a picture that is not on the journey.
 */
export function worldMoment(
  book: V2Spellbook,
  pieceId: string,
  wasNew: boolean,
): WorldMoment | null {
  const level = pictureLevel(pieceId);
  const entry = JOURNEY.find((e) => e.id === level?.id);
  if (!level || !entry) return null;
  const identity = WORLD_IDENTITIES[worldForTheme(level.subject?.theme ?? "") ?? WORLD_IDS[0]!];
  const section = buildGallery(book).sections.find((s) => s.chapter === entry.chapter);
  if (!section) return null;
  const { collected } = section;
  const total = section.cards.length;
  const name = entry.chapterName;
  const line =
    wasNew && total > 1 && collected === total
      ? `${name}: every page collected`
      : wasNew && collected === 1
        ? `First page of ${name}`
        : `${name} · ${collected} of ${total} ${total === 1 ? "page" : "pages"}`;
  return {
    worldName: name,
    line,
    seal: identity.seal,
    backdrop: identity.backdrop,
  };
}

/** The seal's outline as points around (0, 0) within radius `r`, for `Graphics.fillPoints`. */
export function sealPoints(kind: SealKind, r: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  switch (kind) {
    case "star":
      // Four long points and four short ones.
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const len = i % 2 === 0 ? r : r * 0.35;
        pts.push({ x: Math.cos(a) * len, y: Math.sin(a) * len });
      }
      return pts;
    case "crystal":
      // A pointed prism: tip, shoulders, base.
      return [
        { x: 0, y: -r },
        { x: r * 0.55, y: -r * 0.35 },
        { x: r * 0.55, y: r * 0.6 },
        { x: 0, y: r },
        { x: -r * 0.55, y: r * 0.6 },
        { x: -r * 0.55, y: -r * 0.35 },
      ];
    case "crescent": {
      // The outer circle minus a circle offset to the right: where they cross, and the two arcs.
      const d = 0.45;
      const rho = 0.8;
      const x = (1 - rho * rho + d * d) / (2 * d);
      const y = Math.sqrt(1 - x * x);
      const outerStart = Math.atan2(y, x);
      const innerStart = Math.atan2(y, x - d);
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const a = outerStart + (i / steps) * (2 * Math.PI - 2 * outerStart);
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      for (let i = 0; i <= steps; i++) {
        const a = 2 * Math.PI - innerStart - (i / steps) * (2 * Math.PI - 2 * innerStart);
        pts.push({ x: (d + Math.cos(a) * rho) * r, y: Math.sin(a) * rho * r });
      }
      return pts;
    }
  }
}

/** How long the seal's one ring pulse lasts. */
export const PULSE_MS = 900;

/**
 * Whether the ring plays at all: only when the reveal ran to its end by itself (a skip means no
 * show), motion is allowed, the reveal is not a redraw of one already seen, and there is a world.
 */
export function shouldPulse(o: {
  skipped: boolean;
  reduced: boolean;
  instant: boolean;
  hasWorld: boolean;
}): boolean {
  return o.hasWorld && !o.skipped && !o.reduced && !o.instant;
}

/**
 * The seal's ring pulse `elapsedMs` after the reveal finished: radius 0..1 (of the picture) and alpha.
 * Nothing is drawn (alpha 0) before it starts or after it ends.
 */
export function sealPulse(elapsedMs: number): { radius: number; alpha: number } {
  if (elapsedMs < 0 || elapsedMs >= PULSE_MS) return { radius: 0, alpha: 0 };
  const t = elapsedMs / PULSE_MS;
  return { radius: 1 - (1 - t) * (1 - t), alpha: 0.7 * (1 - t) };
}
