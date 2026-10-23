import { buildGallery } from "./gallery";
import { artLevelForPiece } from "./artLevels";
import { WORLD_IDENTITIES, worldForTheme, type SealKind } from "./worldIdentity";
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
 * collected the picture. Null for a picture no world claims. "Every page so far" is deliberate: the
 * worlds are not filled yet, so it never claims a world is finished.
 */
export function worldMoment(
  book: V2Spellbook,
  pieceId: string,
  wasNew: boolean,
): WorldMoment | null {
  const subject = artLevelForPiece(pieceId)?.subject;
  const id = subject ? worldForTheme(subject.theme) : null;
  if (!id) return null;
  const identity = WORLD_IDENTITIES[id];
  const section = buildGallery(book).sections.find((s) => s.name === identity.name);
  if (!section) return null;
  const { collected } = section;
  const total = section.cards.length;
  const line =
    wasNew && total > 1 && collected === total
      ? `${identity.name}: every page so far`
      : wasNew && collected === 1
        ? `First page of ${identity.name}`
        : `${identity.name} · ${collected} of ${total} ${total === 1 ? "page" : "pages"}`;
  return {
    worldName: identity.name,
    line,
    seal: identity.seal,
    backdrop: identity.atmosphere.backdrop,
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
 * The seal's ring pulse `elapsedMs` after the reveal finished: radius 0..1 (of the picture) and alpha.
 * Nothing is drawn (alpha 0) before it starts, after it ends, or at all with reduced motion or when
 * the reveal was skipped: a skip means no show.
 */
export function sealPulse(
  elapsedMs: number,
  opts: { reduced: boolean; skipped: boolean },
): { radius: number; alpha: number } {
  if (opts.reduced || opts.skipped || elapsedMs < 0 || elapsedMs >= PULSE_MS)
    return { radius: 0, alpha: 0 };
  const t = elapsedMs / PULSE_MS;
  return { radius: 1 - (1 - t) * (1 - t), alpha: 0.7 * (1 - t) };
}
