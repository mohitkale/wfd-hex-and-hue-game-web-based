// A type-only import: the piece model lives with the art tooling that checks it.
import type { ArtPiece } from "../../tools/art/piece";

/**
 * The v2 art library (docs/ART_DIRECTION_V2.md). Every piece here is checked by `npm run art:check`.
 * Pieces are added by M11.3 (the representative set) and, after gate G2, by M13.1.
 */
export const pieces: ArtPiece[] = [];

/**
 * Ids of pieces a shipped world references (M13.1). A shipped piece must be reviewed by a named
 * human and must not be a generated draft; `art:check` fails otherwise. Empty until after gate G2.
 */
export const SHIPPED: readonly string[] = [];
