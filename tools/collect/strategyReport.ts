/**
 * Per-strategy results on the real levels (docs/V2_STRATEGIES.md): which of the nine cheap players
 * and random play beat each level, and which difficulty tiers' simple-player rules it satisfies.
 *
 *   npm run strategy:report
 */
import * as collect from "@hexhue/core/collect";
import { pathToFileURL } from "node:url";
import { tiersSatisfied } from "../../content/difficulty";
import { ART_LEVELS } from "../../packages/game/src/collect/artLevels";
import { moonlitHat } from "../../packages/game/src/collect/slice";

export interface Row {
  id: string;
  report: collect.StrategyReport;
  tiers: string[];
}

export function rows(): Row[] {
  const levels = [moonlitHat(), ...Object.values(ART_LEVELS).map((make) => make())];
  return levels.map((level) => {
    const report = collect.strategyReport(level);
    return { id: level.id, report, tiers: tiersSatisfied(report) };
  });
}

export function table(rs: Row[]): string {
  const head = ["level", ...collect.DETERMINISTIC_PLAYERS, "wins", "random", "tiers"];
  const lines = [head.join(" | ")];
  for (const r of rs) {
    lines.push(
      [
        r.id,
        ...collect.DETERMINISTIC_PLAYERS.map((p) =>
          r.report.wins[p] ? "win" : (r.report.losses[p] ?? "lose"),
        ),
        String(r.report.simpleWins),
        `${Math.round(r.report.randomRate * 100)} %`,
        r.tiers.join(", ") || "none",
      ].join(" | "),
    );
  }
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) console.log(table(rows()));
