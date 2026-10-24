/**
 * Engine cost per tick on the v2 levels (docs/QA.md, M15.3): how long `step` takes, in Node, with
 * an eager bot keeping the board busy. Pathfinding is not per frame: a route is computed when a
 * familiar is given a target, the distance map only when a cube is picked up. This measures the sum.
 *
 *   npm run perf:engine
 *
 * Times depend on the machine and are printed, never asserted (a CI time limit would flake).
 */
import * as collect from "@hexhue/core/collect";
import { ART_LEVELS } from "../../packages/game/src/collect/artLevels";
import { DEV_LEVELS } from "../../packages/game/src/collect/levels";
import { moonlitHat } from "../../packages/game/src/collect/slice";

export interface TickCost {
  id: string;
  cubes: number;
  ticks: number;
  status: string;
  /** Milliseconds per tick: mean and the 99th percentile / worst single tick. */
  meanMs: number;
  p99Ms: number;
  maxMs: number;
  peakFamiliars: number;
}

export function measure(level: collect.CollectLevel): TickCost {
  const session = new collect.CollectSession(level);
  const samples: number[] = [];
  let peak = 0;
  for (let guard = 0; session.state.status === "playing" && guard < 1_000_000; guard++) {
    const legal = collect.legalActions(session.state);
    if (legal.length > 0) {
      session.tap(legal.find((a) => a.kind === "resume") ?? legal[0]!);
      continue;
    }
    const t0 = performance.now();
    const batch = session.tick();
    const dt = performance.now() - t0;
    if (batch === null) break;
    samples.push(dt);
    peak = Math.max(peak, session.state.familiars.length);
  }
  samples.sort((a, b) => a - b);
  const pick = (q: number) =>
    samples[Math.min(samples.length - 1, Math.floor(samples.length * q))] ?? 0;
  const mean = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
  return {
    id: level.id,
    cubes: level.cells.filter((c) => c !== -1).length,
    ticks: samples.length,
    status: session.state.status,
    meanMs: mean,
    p99Ms: pick(0.99),
    maxMs: samples.at(-1) ?? 0,
    peakFamiliars: peak,
  };
}

export const LEVELS = (): collect.CollectLevel[] => [
  moonlitHat(),
  ...Object.values(ART_LEVELS).map((make) => make()),
  DEV_LEVELS.dense!(),
  DEV_LEVELS.big!(),
];

if (process.argv[1]?.endsWith("engineTicks.ts")) {
  console.log(
    "level                    cubes  ticks  mean ms  p99 ms  max ms  peak familiars  result",
  );
  for (const level of LEVELS()) {
    measure(level); // warm up the JIT
    const r = measure(level);
    console.log(
      [
        r.id.padEnd(24),
        String(r.cubes).padStart(5),
        String(r.ticks).padStart(6),
        r.meanMs.toFixed(3).padStart(8),
        r.p99Ms.toFixed(3).padStart(7),
        r.maxMs.toFixed(3).padStart(7),
        String(r.peakFamiliars).padStart(14),
        r.status,
      ].join(" "),
    );
  }
}
