import type { Art } from "@hexhue/core";
import { HOUSE_FAMILIES, ROLES, type PartialRamp, type Role } from "./families";

/** The five themes of the representative set (ROADMAP M11.3); more arrive with the catalogue. */
export const THEMES = ["moon", "ritual", "crystal", "astrology", "familiar", "other"] as const;
export type Theme = (typeof THEMES)[number];

export const SOURCES = ["hand-drawn", "imported-png", "generated-draft"] as const;
export type Source = (typeof SOURCES)[number];

/**
 * Closed vocabulary, so a licence is a decision and not free text. The repository has no licence
 * file yet: `original-owner-pending` means original work whose licence the owner has not chosen.
 */
export const LICENCES = [
  "original-owner-pending",
  "original-owner",
  "CC0-1.0",
  "CC-BY-4.0",
] as const;
export type Licence = (typeof LICENCES)[number];

export interface Provenance {
  /** Who drew it (a person's name or a handle). */
  author: string;
  source: Source;
  licence: Licence;
  /** A human has reviewed the contact sheet and approved the piece (ART_DIRECTION_V2 §6). */
  reviewed: boolean;
  /** Required when `reviewed`: who. CI, solvers and simulated players are not reviewers. */
  reviewedBy?: string;
  /** Required when `reviewed`: `YYYY-MM-DD`. */
  reviewedOn?: string;
  notes?: string;
}

/**
 * A hand-authored v2 picture (docs/ART_DIRECTION_V2.md). Each legend character is one shade of one
 * colour family; gameplay uses the family, the renderer the shade.
 */
export interface ArtPiece {
  id: string;
  name: string;
  theme: Theme;
  /** One line for the reveal and the Spellbook card; no unsupported historical or religious claims. */
  lore: string;
  /** `.` is empty; every other character must be in `legend`. */
  rows: string[];
  legend: Record<string, readonly [family: string, role: Role]>;
  /** Custom ramps for families that are not house families (they must pass the same rules). */
  families?: Record<string, PartialRamp>;
  /** Families that form the backdrop (a shaped vignette), if any (rule A-33). */
  backdrop?: string[];
  /** Legend characters that are deliberate one-cell features (an eye glint, a rune dot). */
  features?: string;
  provenance: Provenance;
}

export interface Cell {
  ch: string;
  family: string;
  role: Role;
  hex: string;
}

export interface ParsedPiece {
  width: number;
  height: number;
  /** Row-major; `null` is empty. */
  cells: (Cell | null)[];
  /** Resolved colour of each (family, role) the piece may use. */
  ramps: Record<string, PartialRamp>;
}

/** Resolves a family's ramp: the piece's own, else the house one. */
export function rampOf(piece: Pick<ArtPiece, "families">, family: string): PartialRamp | undefined {
  return piece.families?.[family] ?? HOUSE_FAMILIES[family];
}

/** Structural errors that make a piece unreadable at all (rules are checked on parsed pieces). */
export function parsePiece(piece: ArtPiece): ParsedPiece {
  const fail = (msg: string): never => {
    throw new Error(`${piece.id}: ${msg}`);
  };
  if (piece.rows.length === 0) fail("no rows");
  const width = piece.rows[0]!.length;
  piece.rows.forEach((row, y) => {
    if (row.length !== width) fail(`row ${y} has ${row.length} cells, expected ${width}`);
  });
  const ramps: Record<string, PartialRamp> = {};
  const cells: (Cell | null)[] = [];
  for (const row of piece.rows) {
    for (const ch of row) {
      if (ch === "." || ch === " ") {
        cells.push(null);
        continue;
      }
      const entry = piece.legend[ch];
      if (!entry) return fail(`character "${ch}" is not in the legend`);
      const [family, role] = entry;
      const ramp = rampOf(piece, family);
      if (!ramp) return fail(`unknown family "${family}" (add it under \`families\`)`);
      if (!ROLES.includes(role)) return fail(`unknown role "${role}"`);
      const hex = ramp[role];
      if (!hex) return fail(`family "${family}" has no ${role} shade`);
      ramps[family] = ramp;
      cells.push({ ch, family, role, hex });
    }
  }
  if (!cells.some((c) => c)) fail("no filled cells");
  return { width, height: piece.rows.length, cells, ramps };
}

/**
 * What the game needs from a piece: the gameplay `Art` (one palette entry per family, its base
 * colour) and the per-cube shade layer for `CollectLevel.shades` (M11.2).
 */
export function pieceToArt(piece: ArtPiece): {
  art: Art;
  shades: { colors: string[]; family: number[]; cells: number[] };
} {
  const parsed = parsePiece(piece);
  const familyOrder: string[] = [];
  const shadeKeys: string[] = [];
  const colors: string[] = [];
  const shadeFamily: number[] = [];
  const art: Art = { width: parsed.width, height: parsed.height, palette: [], cells: [] };
  const shadeCells: number[] = [];
  for (const cell of parsed.cells) {
    if (!cell) {
      art.cells.push(-1);
      shadeCells.push(-1);
      continue;
    }
    let f = familyOrder.indexOf(cell.family);
    if (f < 0) {
      f = familyOrder.length;
      familyOrder.push(cell.family);
      art.palette.push(parsed.ramps[cell.family]!.base);
    }
    const key = `${cell.family}/${cell.role}`;
    let s = shadeKeys.indexOf(key);
    if (s < 0) {
      s = shadeKeys.length;
      shadeKeys.push(key);
      colors.push(cell.hex);
      shadeFamily.push(f);
    }
    art.cells.push(f);
    shadeCells.push(s);
  }
  return { art, shades: { colors, family: shadeFamily, cells: shadeCells } };
}
