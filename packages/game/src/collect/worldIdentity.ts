/**
 * What makes each v2 world recognisable beyond its colours (docs/V2_WORLDS.md, M13.1): the subjects
 * its pictures show, the atmosphere behind the board (how the lights behave, not only what colour
 * they are), the voice of its lore and the board's backdrop. Pure data: the game reads the
 * atmosphere, the content and its tests read the rest.
 */

export type WorldId = "moonlit" | "crystal" | "zodiac";

/** How the lights behind the board move. */
export type Motion =
  /** Rise slowly with a small sway and wrap at the top (candle sparks, fireflies). */
  | "rise"
  /** Stay put and flash in place (sparkling facets). */
  | "twinkle"
  /** Circle slowly around a fixed point (stars wheeling). */
  | "orbit";

export interface Atmosphere {
  motion: Motion;
  /** Lights behind the board. */
  count: number;
  /** Tints (0xrrggbb) handed out round-robin. */
  tints: readonly number[];
  /** Size of a light in cells (the smallest, and the spread above it). */
  size: { min: number; spread: number };
  /** Peak alpha above the faint floor (0..1) and how deep the twinkle goes (0 steady .. 1 full). */
  brightness: number;
  twinkle: number;
  /** Speed factor of the motion (1 = the original gentle rise). */
  speed: number;
  /** Colour of the night behind everything (the camera background). */
  backdrop: number;
}

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
  atmosphere: Atmosphere;
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
    atmosphere: {
      motion: "rise",
      count: 14,
      tints: [0xf6d97a, 0xb48cff, 0xb48cff],
      size: { min: 0.5, spread: 0.7 },
      brightness: 0.16,
      twinkle: 1,
      speed: 1,
      backdrop: 0x140b2e,
    },
    seal: { kind: "crescent", color: 0xf6d97a },
  },
  crystal: {
    id: "crystal",
    name: "Crystal Garden",
    tagline: "Minerals and magical growing things.",
    themes: ["crystal", "familiar"],
    families: ["Teal", "Moss", "Rose", "Amethyst"],
    voice: "Folklore of stones and green things, never a health claim.",
    atmosphere: {
      motion: "twinkle",
      count: 22,
      tints: [0x78d9cd, 0xf7a9d6, 0xdcc7f4, 0xffffff],
      size: { min: 0.3, spread: 0.45 },
      brightness: 0.3,
      twinkle: 1,
      speed: 1.6,
      backdrop: 0x0a1a26,
    },
    seal: { kind: "crystal", color: 0x78d9cd },
  },
  zodiac: {
    id: "zodiac",
    name: "Zodiac Realm",
    tagline: "Constellations, planets and the twelve signs.",
    themes: ["astrology"],
    families: ["Sapphire", "Gold", "Moonstone", "Night"],
    voice: "Old sky-lore: what each sign was said to watch over.",
    atmosphere: {
      motion: "orbit",
      count: 30,
      tints: [0xffffff, 0xf6d97a, 0x89aef0],
      size: { min: 0.2, spread: 0.3 },
      brightness: 0.2,
      twinkle: 0.7,
      speed: 0.5,
      backdrop: 0x0a0a2e,
    },
    seal: { kind: "star", color: 0x89aef0 },
  },
};

export const WORLD_IDS: readonly WorldId[] = ["moonlit", "crystal", "zodiac"];

/** The world a picture of this theme belongs to, or null for a theme no world claims (`other`). */
export function worldForTheme(theme: string): WorldId | null {
  return WORLD_IDS.find((w) => WORLD_IDENTITIES[w].themes.includes(theme)) ?? null;
}

/** The atmosphere for a picture theme: its world's, or the Moonlit default for an unclaimed theme. */
export function atmosphereForTheme(theme: string | undefined): Atmosphere {
  const world = theme ? worldForTheme(theme) : null;
  return WORLD_IDENTITIES[world ?? "moonlit"].atmosphere;
}
