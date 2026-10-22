/**
 * Prints how simple automatic players fare on every shipped v1 level (see strategies.ts).
 *
 *   npm run audit:v1               # win rates per level, world and overall
 *   npm run audit:v1 -- --decisions   # also the decision profile of each stored solution (slower)
 */
import { EMPTY } from "@hexhue/core";
import { worlds } from "../../packages/game/src/levels";
import { STRATEGIES, decisionProfile, winRates, type StrategyName } from "./strategies";

const withDecisions = process.argv.includes("--decisions");
const names = Object.keys(STRATEGIES) as StrategyName[];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

const perWorld = new Map<string, Record<StrategyName, number[]>>();
const all = Object.fromEntries(names.map((n) => [n, [] as number[]])) as Record<
  StrategyName,
  number[]
>;

console.log(["level", "size", "cells", "colors", "wisps", "slots", ...names].join("\t"));
for (const world of worlds) {
  const acc = Object.fromEntries(names.map((n) => [n, [] as number[]])) as Record<
    StrategyName,
    number[]
  >;
  perWorld.set(world.name, acc);
  for (const built of world.levels) {
    const level = built.level;
    const rates = winRates(level);
    for (const n of names) {
      acc[n].push(rates[n]);
      all[n].push(rates[n]);
    }
    const cells = level.cells.filter((c) => c !== EMPTY).length;
    const colors = new Set(level.cells.filter((c) => c !== EMPTY)).size;
    const wisps = level.columns.reduce((n, c) => n + c.length, 0);
    console.log(
      [
        level.id,
        `${level.width}x${level.height}`,
        cells,
        colors,
        wisps,
        level.slots,
        ...names.map((n) => pct(rates[n])),
      ].join("\t"),
    );
    if (withDecisions) {
      const d = decisionProfile(level, built.solution);
      console.log(
        `  decisions: ${d.steps} steps, ${d.meanMoves.toFixed(1)} legal / ${d.meanViable.toFixed(1)} viable per step, ` +
          `${pct(d.freeSteps)} free, ${pct(d.forcedSteps)} forced`,
      );
    }
  }
}

console.log("\nMean win rate");
console.log(["world", ...names].join("\t"));
for (const [world, acc] of perWorld) {
  console.log([world, ...names.map((n) => pct(mean(acc[n])))].join("\t"));
}
console.log(["all levels", ...names.map((n) => pct(mean(all[n])))].join("\t"));
