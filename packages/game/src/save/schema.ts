/** Current save format. Bump and add a step to `MIGRATIONS` whenever the shape changes. */
export const SAVE_VERSION = 1;

export const BOOSTERS = ["undo", "shuffle", "extraSlot", "wand"] as const;
export type BoosterKind = (typeof BOOSTERS)[number];

export interface LevelProgress {
  /** Best rating earned (1–3). */
  stars: number;
  /** Times the level was completed. */
  wins: number;
}

export interface Settings {
  haptics: boolean;
  sound: boolean;
  music: boolean;
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  /** Keyed by level id (e.g. "moonlit-04"), so reordering content never scrambles progress. */
  levels: Record<string, LevelProgress>;
  coins: number;
  boosters: Record<BoosterKind, number>;
  /** How many times 2× speed has been unlocked; drives the free / ad alternation. */
  speedTurns: number;
  settings: Settings;
  stats: { plays: number; wins: number; losses: number };
  /** Where the player last was, for "continue". */
  lastPlayed: { world: number; level: number } | null;
}

/** A brand-new player: some coins and two of each booster so they can try everything. */
export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    levels: {},
    coins: 100,
    boosters: { undo: 2, shuffle: 2, extraSlot: 2, wand: 2 },
    speedTurns: 0,
    settings: { haptics: true, sound: true, music: true },
    stats: { plays: 0, wins: 0, losses: 0 },
    lastPlayed: null,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
/** Non-numbers fall back to the default; negative numbers clamp to 0 (never a free top-up). */
const count = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;
const flag = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

/**
 * Upgrades older save shapes step by step. Each entry takes data at version `n` and returns it at
 * version `n + 1`. Version 0 means "no version field" (never shipped, kept as the base case).
 */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  0: (data) => ({ ...data, version: 1 }),
};

/**
 * Turns whatever was stored (possibly missing, old, partial or corrupted) into valid current
 * data. Every field is checked on its own and falls back to its default, so one bad value never
 * wipes a player's progress.
 */
export function migrate(raw: unknown): SaveData {
  const fresh = defaultSave();
  if (!isObject(raw)) return fresh;
  let data = raw;
  let version =
    typeof data.version === "number" && Number.isInteger(data.version) && data.version >= 0
      ? data.version
      : 0;
  if (version > SAVE_VERSION) {
    // Written by a newer build (e.g. after a rollback): read what we understand.
    version = SAVE_VERSION;
  }
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return fresh;
    data = step(data);
    version++;
  }

  // Built with fromEntries so an id like "__proto__" stays a plain key, never a prototype.
  const levels: Record<string, LevelProgress> = Object.fromEntries(
    isObject(data.levels)
      ? Object.entries(data.levels)
          .filter((e): e is [string, Record<string, unknown>] => isObject(e[1]))
          .map(([id, p]) => [
            id,
            {
              stars: Math.min(3, Math.max(1, count(p.stars, 1))),
              wins: Math.max(1, count(p.wins, 1)),
            },
          ])
      : [],
  );
  const boosters = { ...fresh.boosters };
  if (isObject(data.boosters)) {
    for (const k of Object.keys(boosters) as (keyof typeof boosters)[]) {
      boosters[k] = count(data.boosters[k], fresh.boosters[k]);
    }
  }
  const settings = isObject(data.settings) ? data.settings : {};
  const stats = isObject(data.stats) ? data.stats : {};
  const last = isObject(data.lastPlayed) ? data.lastPlayed : null;

  return {
    version: SAVE_VERSION,
    levels,
    coins: count(data.coins, fresh.coins),
    boosters,
    speedTurns: count(data.speedTurns, 0),
    settings: {
      haptics: flag(settings.haptics, true),
      sound: flag(settings.sound, true),
      music: flag(settings.music, true),
    },
    stats: {
      plays: count(stats.plays, 0),
      wins: count(stats.wins, 0),
      losses: count(stats.losses, 0),
    },
    lastPlayed:
      last && typeof last.world === "number" && typeof last.level === "number"
        ? { world: count(last.world, 0), level: count(last.level, 0) }
        : null,
  };
}
