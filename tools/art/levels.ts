/**
 * Playable preview levels for the v2 art library (M11.5): each piece becomes a `CollectLevel` with
 * its shades and subject, so a win can reveal the picture and unlock it in the Spellbook.
 *
 *   npm run art:levels     # rewrites packages/game/src/collect/generated/art-levels.json
 *
 * The groups are dealt by a seeded search until an eager bot can win, which is only a way to get a
 * playable review level: real level design (solver, anti-triviality, difficulty) is M12. The output
 * is committed, and a test fails when it is stale.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRng } from "@hexhue/core";
import * as collect from "@hexhue/core/collect";
import { pieces } from "../../content/v2art";
import { botPlay } from "../collect/density";
import { encodeArtLevel } from "../../packages/game/src/collect/artLevelCodec";
import { pieceToArt, type ArtPiece } from "./piece";

export const OUTPUT = new URL(
  "../../packages/game/src/collect/generated/art-levels.json",
  import.meta.url,
);

/** Deals one piece into groups and columns; the first seed an eager bot wins with is kept. */
export function levelForPiece(piece: ArtPiece): collect.CollectLevel {
  const { art, shades } = pieceToArt(piece);
  const counts = new Array<number>(art.palette.length).fill(0);
  for (const c of art.cells) if (c >= 0) counts[c]!++;
  const cubes = counts.reduce((a, b) => a + b, 0);
  const chunk = Math.max(12, Math.round(cubes / 14));
  for (let seed = 1; seed <= 400; seed++) {
    const rng = createRng(seed);
    const groups: collect.GroupSpec[] = [];
    counts.forEach((n, color) => {
      let left = n;
      while (left > 0) {
        const take =
          left <= chunk * 1.5 ? left : rng.int(Math.round(chunk * 0.7), Math.round(chunk * 1.3));
        groups.push({ color, capacity: take });
        left -= take;
      }
    });
    const columns: collect.GroupSpec[][] = [[], [], [], []];
    rng.shuffle(groups).forEach((g, i) => columns[i % columns.length]!.push(g));
    const level: collect.CollectLevel = {
      id: `art-${piece.id}`,
      name: piece.name,
      width: art.width,
      height: art.height,
      palette: art.palette,
      cells: art.cells,
      columns,
      slots: 4,
      squad: 4,
      spawnGap: 1,
      fieldCap: 4,
      shades,
      subject: { id: piece.id, name: piece.name, theme: piece.theme, lore: piece.lore },
    };
    if (collect.validateCollectLevel(level).length > 0) continue;
    if (botPlay(level, true).status === "won") return level;
  }
  throw new Error(`${piece.id}: no group dealing a simple bot can win in 400 seeds`);
}

export const artLevels = (): collect.CollectLevel[] => pieces.map(levelForPiece);

export const serialize = (levels: collect.CollectLevel[]): string =>
  JSON.stringify(levels.map(encodeArtLevel), null, 1) + "\n";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  writeFileSync(OUTPUT, serialize(artLevels()));
  console.log(`→ ${fileURLToPath(OUTPUT)} (${pieces.length} levels)`);
}
