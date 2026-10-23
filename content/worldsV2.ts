import { stageForLevel, type Stage } from "./curveV2";
import type { Tier } from "./difficulty";
import { POOL } from "./poolV2";
import {
  WORLD_IDENTITIES,
  WORLD_IDS,
  worldForTheme,
  type WorldId,
  type WorldIdentity,
} from "../packages/game/src/collect/worldIdentity";

/**
 * The three v2 worlds as a plan on the difficulty curve (docs/V2_WORLDS.md, M13.1): which global
 * level numbers each owns, what each slot should be, and which slots are filled by levels that pass
 * the quality gate (`poolV2.ts`). Identity (themes, atmosphere, voice) lives in
 * `packages/game/src/collect/worldIdentity.ts` so the game can read it.
 *
 * Levels are numbered globally (the curve's numbering), twenty to a world, so difficulty keeps
 * rising from world to world: Moonlit is the tutorial and easy stretch, Crystal Garden medium and
 * the start of ordering decisions, Zodiac Realm ordering and the advanced stretch.
 */

export const WORLD_SIZE = 20;

export interface WorldRange {
  id: WorldId;
  /** First and last global level number (inclusive). */
  from: number;
  to: number;
}

export const WORLDS: readonly WorldRange[] = WORLD_IDS.map((id, i) => ({
  id,
  from: i * WORLD_SIZE + 1,
  to: (i + 1) * WORLD_SIZE,
}));

export const TOTAL_LEVELS = WORLDS.at(-1)!.to;

export interface Slot {
  world: WorldId;
  /** 1-based number inside the world, and the global number. */
  index: number;
  level: number;
  stage: Stage["id"];
  tier: Tier;
  /** What this slot is for: the picture's subject area and the skill the stage teaches. */
  plan: string;
  /** The pool level that fills it, or null while it is planned. */
  levelId: string | null;
}

export function worldOfLevel(level: number): WorldId {
  const w = WORLDS.find((r) => level >= r.from && level <= r.to);
  if (!w) throw new Error(`level ${level} is outside the three worlds (1..${TOTAL_LEVELS})`);
  return w.id;
}

/**
 * Every slot of every world, in order. A slot is `placed` when a pool level (a level that passes the
 * quality gate, with its recorded deviations) is registered at its number.
 */
export function slots(): Slot[] {
  const byLevel = new Map(POOL.map((p) => [p.level, p.id]));
  const out: Slot[] = [];
  for (const w of WORLDS) {
    const identity = WORLD_IDENTITIES[w.id];
    for (let level = w.from; level <= w.to; level++) {
      const stage = stageForLevel(level);
      out.push({
        world: w.id,
        index: level - w.from + 1,
        level,
        stage: stage.id,
        tier: stage.tier,
        plan: `${identity.themes.join(" or ")} picture · ${stage.name.toLowerCase()}: ${stage.teaches}`,
        levelId: byLevel.get(level) ?? null,
      });
    }
  }
  return out;
}

export interface WorldProgress {
  identity: WorldIdentity;
  from: number;
  to: number;
  placed: number;
  planned: number;
  /** Stages the world's levels span. */
  stages: string[];
}

export function progress(): WorldProgress[] {
  const all = slots();
  return WORLDS.map((w) => {
    const mine = all.filter((s) => s.world === w.id);
    return {
      identity: WORLD_IDENTITIES[w.id],
      from: w.from,
      to: w.to,
      placed: mine.filter((s) => s.levelId).length,
      planned: mine.filter((s) => !s.levelId).length,
      stages: [...new Set(mine.map((s) => s.stage))],
    };
  });
}

/** The world a library piece belongs to by its theme (null for a theme no world claims). */
export const worldOfTheme = worldForTheme;
