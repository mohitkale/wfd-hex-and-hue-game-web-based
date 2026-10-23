import * as collect from "@hexhue/core/collect";

/** Padded cell → key palette index of every cube that is sealed right now (M13.4), for drawing. */
export function sealMap(state: collect.CollectState): Map<number, number> {
  const map = new Map<number, number>();
  for (const cell of collect.sealedCells(state)) map.set(cell, collect.sealKeyAt(state, cell)!);
  return map;
}
