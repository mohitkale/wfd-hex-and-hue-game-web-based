/**
 * What makes each v2 world recognisable beyond its colours (docs/V2_WORLDS.md, M13.1): the subjects
 * its pictures show, the voice of its lore, its seal and its backdrop colour. Pure data: the win
 * screen reads the seal and the backdrop for a picture's theme.
 */

export type WorldId = "moonlit" | "crystal" | "zodiac";

/** The world's seal: a small mark shown on its completion moments (M13.3). */
export type SealKind = "crescent" | "crystal" | "star";

export interface WorldIdentity {
  id: WorldId;
  name: string;
  tagline: string;
  /** Art themes (docs/ART_DIRECTION_V2.md) whose pictures belong here. */
  themes: readonly string[];
  /** House colour families the world's pictures lean on (ART_DIRECTION_V2 §3). */
  families: readonly string[];
  /** How its lore speaks, for authors. */
  voice: string;
  /** Colour of the night behind the win screen. */
  backdrop: number;
  seal: { kind: SealKind; color: number };
}

export const WORLD_IDENTITIES: Readonly<Record<WorldId, WorldIdentity>> = {
  moonlit: {
    id: "moonlit",
    name: "Moonlit Beginnings",
    tagline: "Moon phases and gentle rituals by candlelight.",
    themes: ["moon", "ritual"],
    families: ["Gold", "Moonstone", "Amethyst", "Ember"],
    voice: "Quiet and domestic: a hearth, a candle, a first spell.",
    backdrop: 0x140b2e,
    seal: { kind: "crescent", color: 0xf6d97a },
  },
  crystal: {
    id: "crystal",
    name: "Crystal Garden",
    tagline: "Minerals and magical growing things.",
    themes: ["crystal", "familiar"],
    families: ["Teal", "Moss", "Rose", "Amethyst"],
    voice: "Folklore of stones and green things, never a health claim.",
    backdrop: 0x0a1a26,
    seal: { kind: "crystal", color: 0x78d9cd },
  },
  zodiac: {
    id: "zodiac",
    name: "Zodiac Realm",
    tagline: "Constellations, planets and the twelve signs.",
    themes: ["astrology"],
    families: ["Sapphire", "Gold", "Moonstone", "Night"],
    voice: "Old sky-lore: what each sign was said to watch over.",
    backdrop: 0x0a0a2e,
    seal: { kind: "star", color: 0x89aef0 },
  },
};

export const WORLD_IDS: readonly WorldId[] = ["moonlit", "crystal", "zodiac"];

/** The world a picture of this theme belongs to, or null for a theme no world claims (`other`). */
export function worldForTheme(theme: string): WorldId | null {
  return WORLD_IDS.find((w) => WORLD_IDENTITIES[w].themes.includes(theme)) ?? null;
}
