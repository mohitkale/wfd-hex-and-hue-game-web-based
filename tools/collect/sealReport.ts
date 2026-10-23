/**
 * What wax seals do to a level (docs/V2_VARIETY.md): the same pictures generated with no seal, one
 * sealed colour and two, at the gentle profile, and how the nine simple players and random play fare.
 *
 *   npm run seals:report
 *
 * A level that is "unsolvable" never appears: the generator keeps only solver-verified levels, so a
 * row says `none` when no candidate of the seed was winnable with a seal that meets the opening.
 */
import * as collect from "@hexhue/core/collect";
import { pathToFileURL } from "node:url";
import { pieces } from "../../content/v2art";
import { pieceToArt } from "../art/piece";

export interface SealRow {
  piece: string;
  seals: number;
  /** Null when no level of the seed met the profile with that many seals. */
  result: {
    groups: number;
    slots: number;
    minSlots: number;
    sealedCubes: number;
    openingSealed: number;
    simpleWins: number;
    randomRate: number;
    score: number | null;
  } | null;
}

export const SEED = 1;

export function rows(counts: readonly number[] = [0, 1, 2]): SealRow[] {
  const out: SealRow[] = [];
  for (const piece of pieces) {
    const { art } = pieceToArt(piece);
    for (const seals of counts) {
      const g = collect.generateLevel(art, `seal-${piece.id}`, piece.name, {
        seed: SEED,
        profile: "gentle",
        maxAttempts: 8,
        refineSteps: 4,
        seals,
      });
      if (!g) {
        out.push({ piece: piece.id, seals, result: null });
        continue;
      }
      const report = collect.strategyReport(g.level);
      const measured = collect.measureLevel(g.level);
      out.push({
        piece: piece.id,
        seals,
        result: {
          groups: g.metrics.groups,
          slots: g.level.slots,
          minSlots: g.metrics.minSlots,
          sealedCubes: (g.level.seals ?? []).reduce((n, s) => n + s.cells.length, 0),
          openingSealed: collect.openingSealed(g.level),
          simpleWins: report.simpleWins,
          randomRate: report.randomRate,
          score: measured ? Math.round(collect.difficultyScore(measured).total * 100) / 100 : null,
        },
      });
    }
  }
  return out;
}

export function table(rs: SealRow[]): string {
  const lines = [
    "| picture | sealed colours | sealed cubes (at opening) | min slots | simple players that win | random wins | difficulty score |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rs) {
    const x = r.result;
    lines.push(
      x
        ? `| ${r.piece} | ${r.seals} | ${x.sealedCubes} (${x.openingSealed}) | ${x.minSlots} | ${x.simpleWins}/9 | ${(x.randomRate * 100).toFixed(0)}% | ${x.score ?? "n/a"} |`
        : `| ${r.piece} | ${r.seals} | none | | | | |`,
    );
  }
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) console.log(table(rows()));
