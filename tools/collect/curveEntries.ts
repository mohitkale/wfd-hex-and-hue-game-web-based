import * as collect from "@hexhue/core/collect";
import type { CurveEntry } from "../../content/curveV2";
import { ART_LEVELS } from "../../packages/game/src/collect/artLevels";
import { PREVIEW_LEVEL } from "../art/levels";

/** A level measured and expressed for the curve checks (`content/curveV2.ts`). */
export function curveEntry(level: collect.CollectLevel, number: number): CurveEntry {
  const m = collect.measureLevel(level);
  if (!m) throw new Error(`${level.id}: cannot be measured (the solver cannot win it)`);
  const strategies = { wins: m.wins, randomRate: m.randomRate };
  return {
    level: number,
    id: level.id,
    cubes: level.cells.filter((c) => c >= 0).length,
    measures: {
      score: collect.difficultyScore(m).total,
      deadEndShare: m.deadEndShare,
      temptingPoorShare: m.temptingPoorShare,
      doomedFirstShare: m.doomedFirstShare,
      planningDepth: m.planningDepth,
      hiddenColors: m.hiddenColors,
      slotPressure: m.slotPressure,
      seconds: m.seconds,
    },
    strategies,
    reachableLoss: m.reachableLoss,
  };
}

/** The art library's levels that are placed on the curve, in level order. */
export function placedEntries(): CurveEntry[] {
  return Object.entries(PREVIEW_LEVEL)
    .map(([pieceId, number]) => curveEntry(ART_LEVELS[`art-${pieceId}`]!(), number))
    .sort((a, b) => a.level - b.level);
}
