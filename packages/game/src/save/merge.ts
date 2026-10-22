import { BOOSTERS, migrate, type SaveData } from "./schema";

/**
 * Three-way merge of this tab's save (`mine`, derived from `base`) with what is in storage now
 * (`theirs`, possibly written by another tab, or the real save after a failed initial read).
 *
 * - Counters (coins, boosters, stats, 2× turns) apply this tab's change on top of theirs, so two
 *   tabs spending and earning never lose each other's coins.
 * - Level progress is a union keeping the best stars and the most wins.
 * - Settings and last-played take this tab's value only if this tab changed them.
 */
export function mergeSaves(base: SaveData, mine: SaveData, theirs: SaveData): SaveData {
  const delta = (b: number, m: number, t: number) => Math.max(0, t + (m - b));
  const levels = { ...theirs.levels };
  for (const [id, p] of Object.entries(mine.levels)) {
    const t = levels[id];
    levels[id] = t ? { stars: Math.max(t.stars, p.stars), wins: Math.max(t.wins, p.wins) } : p;
  }
  const boosters = { ...theirs.boosters };
  for (const k of BOOSTERS)
    boosters[k] = delta(base.boosters[k], mine.boosters[k], theirs.boosters[k]);
  const changed = <T>(b: T, m: T) => JSON.stringify(b) !== JSON.stringify(m);

  return migrate({
    ...theirs,
    levels: Object.fromEntries(Object.entries(levels)),
    coins: delta(base.coins, mine.coins, theirs.coins),
    boosters,
    speedTurns: delta(base.speedTurns, mine.speedTurns, theirs.speedTurns),
    stats: {
      plays: delta(base.stats.plays, mine.stats.plays, theirs.stats.plays),
      wins: delta(base.stats.wins, mine.stats.wins, theirs.stats.wins),
      losses: delta(base.stats.losses, mine.stats.losses, theirs.stats.losses),
    },
    settings: changed(base.settings, mine.settings) ? mine.settings : theirs.settings,
    lastPlayed: changed(base.lastPlayed, mine.lastPlayed) ? mine.lastPlayed : theirs.lastPlayed,
  });
}
