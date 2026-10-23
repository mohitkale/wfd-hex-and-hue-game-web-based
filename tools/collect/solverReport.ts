/**
 * What the solver makes of the real levels (docs/V2_SOLVER.md).
 *
 *   npm run solver:report
 */
import * as collect from "@hexhue/core/collect";
import { pathToFileURL } from "node:url";
import { ART_LEVELS } from "../../packages/game/src/collect/artLevels";
import { moonlitHat } from "../../packages/game/src/collect/slice";

export interface Row {
  id: string;
  cubes: number;
  groups: number;
  status: string;
  nodes: number;
  ms: number;
  minSlots: string;
}

export function report(budget = 200_000): Row[] {
  const levels = [moonlitHat(), ...Object.values(ART_LEVELS).map((make) => make())];
  return levels.map((level) => {
    const started = performance.now();
    const solver = new collect.CollectSolver(level, budget);
    const r = solver.solve();
    if (r.status === "solved") {
      const session = collect.replayLine(level, r.line!);
      if (session.state.status !== "won") throw new Error(`${level.id}: solution did not replay`);
    }
    const ms = Math.round(performance.now() - started);
    const slots = collect.minSlots(level, budget);
    return {
      id: level.id,
      cubes: level.cells.filter((c) => c >= 0).length,
      groups: level.columns.reduce((n, c) => n + c.length, 0),
      status: r.status,
      nodes: r.nodes,
      ms,
      minSlots: slots.unknown ? "unknown" : slots.slots === null ? "none" : String(slots.slots),
    };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const rows = report();
  console.log("level                      cubes groups status      nodes     ms  minSlots");
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(26)} ${String(r.cubes).padStart(5)} ${String(r.groups).padStart(6)} ${r.status.padEnd(11)} ${String(r.nodes).padStart(6)} ${String(r.ms).padStart(6)}  ${r.minSlots}`,
    );
  }
}
