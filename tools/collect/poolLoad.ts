import type * as collect from "@hexhue/core/collect";
import { ART_LEVELS } from "../../packages/game/src/collect/artLevels";
import { moonlitHat } from "../../packages/game/src/collect/slice";

/** Resolves a pool level id to its level: the slice, or an art preview level (`art-<piece id>`). */
export function loadPoolLevel(id: string): collect.CollectLevel {
  if (id === "slice-moonlit-hat") return moonlitHat();
  const make = ART_LEVELS[id];
  if (!make) throw new Error(`unknown pool level "${id}"`);
  return make();
}
