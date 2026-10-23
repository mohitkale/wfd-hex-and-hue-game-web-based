import type { ArtPiece } from "../../tools/art/piece";
import { crescentMoon } from "./crescent-moon";
import { tripleMoon } from "./triple-moon";
import { witchsCauldron } from "./witchs-cauldron";
import { amethystCluster } from "./amethyst-cluster";
import { libraScales } from "./libra-scales";
import { blackCat } from "./black-cat";

/**
 * The v2 art library (docs/ART_DIRECTION_V2.md). Every piece here is checked by `npm run art:check`.
 * The representative set (M11.3) awaits the owner's review at gate G2; the rest of the library is
 * authored only after approval (M13.1).
 */
export const pieces: ArtPiece[] = [
  crescentMoon,
  tripleMoon,
  witchsCauldron,
  amethystCluster,
  libraScales,
  blackCat,
];

/**
 * Ids of pieces a shipped world references (M13.1). A shipped piece must be reviewed by a named
 * human and must not be a generated draft; `art:check` fails otherwise. Empty until after gate G2.
 */
export const SHIPPED: readonly string[] = [];
