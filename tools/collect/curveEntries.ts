import * as collect from "@hexhue/core/collect";
import type { CurveEntry } from "../../content/curveV2";
import { ART_LEVELS } from "../../packages/game/src/collect/artLevels";
import { EXTRA_LEVEL, PREVIEW_LEVEL } from "../art/placement";
import { moonlitHat } from "../../packages/game/src/collect/slice";

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

/** The levels placed on the curve (library pieces and the slice), in level order. */
export function placedEntries(): CurveEntry[] {
  const pieces = Object.entries(PREVIEW_LEVEL).map(([pieceId, number]) =>
    curveEntry(ART_LEVELS[`art-${pieceId}`]!(), number),
  );
  const extra = Object.entries(EXTRA_LEVEL).map(([id, number]) => {
    if (id !== "slice-moonlit-hat") throw new Error(`unknown extra level ${id}`);
    return curveEntry(moonlitHat(), number);
  });
  return [...pieces, ...extra].sort((a, b) => a.level - b.level);
}
