/**
 * Decision measures and the difficulty score of the real levels (docs/V2_MEASURES.md), and which
 * tiers' full bands (docs/DIFFICULTY_V2.md §5) each satisfies.
 *
 *   npm run measures:report
 */
import * as collect from "@hexhue/core/collect";
import { pathToFileURL } from "node:url";
import { TIERS, checkLevel, type Tier } from "../../content/difficulty";
import { ART_LEVELS } from "../../packages/game/src/collect/artLevels";
import { moonlitHat } from "../../packages/game/src/collect/slice";

export interface Row {
  id: string;
  m: collect.Measures;
  score: collect.DifficultyScore;
  /** Tiers whose whole band the level satisfies. */
  tiers: Tier[];
}

/** A tutorial level is checked as level 1 when it has no reachable loss, else as level 4. */
export const tiersMet = (m: collect.Measures): Tier[] =>
  TIERS.filter(
    (t) => checkLevel(m, t, t === "tutorial" ? (m.reachableLoss ? 4 : 1) : undefined).length === 0,
  );

export function rows(): Row[] {
  const levels = [moonlitHat(), ...Object.values(ART_LEVELS).map((make) => make())];
  return levels.flatMap((level) => {
    const m = collect.measureLevel(level);
    return m ? [{ id: level.id, m, score: collect.difficultyScore(m), tiers: tiersMet(m) }] : [];
  });
}

export function table(rs: Row[]): string {
  const f = (x: number) => (Number.isFinite(x) ? String(Math.round(x * 100) / 100) : "∞");
  const lines = [
    "level | score | dead ends | tempting | first-move risk | planning | branching (effective) | slot pressure | buried | recovery | minutes | full bands",
  ];
  for (const r of rs) {
    lines.push(
      [
        r.id,
        f(r.score.total),
        f(r.m.deadEndShare),
        f(r.m.temptingPoorShare),
        f(r.m.doomedFirstShare),
        f(r.m.planningDepth),
        `${f(r.m.branching)} (${f(r.m.effectiveBranching)})`,
        f(r.m.slotPressure),
        String(r.m.hiddenColors),
        f(r.m.recoveryDepth),
        f(r.m.seconds / 60),
        r.tiers.join(", ") || "none",
      ].join(" | "),
    );
  }
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const rs = rows();
  console.log(table(rs));
  for (const r of rs) {
    console.log(`\n${r.id}: ${f(r.score.total)}`);
    for (const c of r.score.components) {
      console.log(
        `  ${c.label.padEnd(36)} ${String(c.measure).padEnd(18)} raw ${String(Math.round(c.raw * 100) / 100).padEnd(6)} -> ${f(c.points)} of ${c.weight * 100}`,
      );
    }
  }
}

function f(x: number): string {
  return Number.isFinite(x) ? String(Math.round(x * 10) / 10) : "∞";
}
