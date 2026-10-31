import type * as collect from "@hexhue/core/collect";
import * as A from "./journeyArtA";
import * as B from "./journeyArtB";
import { asLevel, type Canvas } from "./pixelCanvas";
import { PICTURE_PALETTE as P, toPictureBoard } from "./pictureBoard";
import { withSharedTrays } from "./trayRules";
import deals from "./journeyDeals.json";

/**
 * The witch's journey (M15.13, owner request): 24 levels in six chapters, the path of someone learning
 * the craft, from lighting a first candle to writing in their own grimoire. Each chapter climbs from
 * easy to an extreme finale that fills its whole board and carries a word. Every level keeps the
 * normal trays (`withSharedTrays`); its difficulty comes from the picture and how its boxes are dealt
 * (`journeyDeals.json`, found by `tools/collect/journey.ts`).
 */

export type Tier = "easy" | "medium" | "hard" | "extreme";

export interface JourneyEntry {
  /** Level id (`j-<picture>`), the key that loads it and the id the pouch records clears by. */
  id: string;
  name: string;
  chapter: number;
  chapterName: string;
  tier: Tier;
  /** The board as drawn, before its recorded deal (for the dealing tool). */
  base: () => collect.CollectLevel;
  /** The level as played: the board with its recorded deal (or the plain deal if none is recorded). */
  make: () => collect.CollectLevel;
}

/** A recorded deal: every column's boxes, front first, as `[colour, cubes]`, and any wax seals. */
export interface JourneyDeal {
  columns: number[][][];
  /** Wax seals: the cubes at `cells` wait until every box of colour `key` is finished. */
  seals?: collect.SealSpec[];
}

const DEALS = deals as Record<string, JourneyDeal>;

/** `level` with the deal recorded for it, if any (trays stay the board's own). */
export function dealt(level: collect.CollectLevel): collect.CollectLevel {
  const deal = DEALS[level.id];
  if (!deal) return level;
  return {
    ...level,
    ...(deal.seals ? { seals: deal.seals } : {}),
    columns: deal.columns.map((c) =>
      c.map(([color, capacity]) => ({ color: color!, capacity: capacity! })),
    ),
  };
}

export const CHAPTERS = [
  "The Calling",
  "Hedge & Herbs",
  "Crystals",
  "Moon & Stars",
  "Familiars & Spirits",
  "The Grimoire",
] as const;

interface Spec {
  picture: string;
  name: string;
  theme: string;
  lore: string;
  draw: () => Canvas;
  /**
   * The canvas behind the art (owner feedback: the art must sit on a full canvas to pop out, as it
   * does in the win reveal): every empty cell becomes `colour`, with a scatter of `star` cells. A
   * finale draws its own background and has none.
   */
  bg?: { colour: string; star: string };
}

/** Tiers in chapter order: easy, medium, hard, then the extreme finale. */
const TIERS: readonly Tier[] = ["easy", "medium", "hard", "extreme"];

const SPECS: readonly Spec[][] = [
  [
    {
      picture: "candle",
      name: "First Candle",
      theme: "ritual",
      lore: "Every witch begins the same way: one small flame, lit on purpose.",
      draw: A.candle,
      bg: { colour: P.navy, star: P.yellow },
    },
    {
      picture: "witchs-hat",
      name: "The Hat",
      theme: "ritual",
      lore: "Too big at first. It fits a little better after every spell.",
      draw: A.witchsHat,
      bg: { colour: P.skyBlue, star: P.white },
    },
    {
      picture: "broom",
      name: "Besom",
      theme: "ritual",
      lore: "Before it ever flies, a besom sweeps: old dust out, fresh luck in.",
      draw: A.broom,
      bg: { colour: P.navy, star: P.white },
    },
    {
      picture: "blessed-cat",
      name: "Blessed Be",
      theme: "familiar",
      lore: "A black cat chooses you under the full moon. The calling is answered.",
      draw: A.blessedCat,
    },
  ],
  [
    {
      picture: "lavender",
      name: "Lavender",
      theme: "ritual",
      lore: "The first herb a hedge witch learns: it smells of calm and dries in a week.",
      draw: A.lavender,
      bg: { colour: P.tan, star: P.white },
    },
    {
      picture: "mortar",
      name: "Mortar & Pestle",
      theme: "ritual",
      lore: "Grind slowly and think of what you want. The stone remembers.",
      draw: A.mortar,
      bg: { colour: P.skyBlue, star: P.white },
    },
    {
      picture: "mandrake",
      name: "Mandrake",
      theme: "ritual",
      lore: "Pull it up with your ears covered, the old herbals say. Better still, leave it be.",
      draw: A.mandrake,
      bg: { colour: P.skyBlue, star: P.white },
    },
    {
      picture: "brew-cauldron",
      name: "Brew",
      theme: "ritual",
      lore: "Herbs, water, fire and patience: the first potion that is entirely yours.",
      draw: A.brewCauldron,
    },
  ],
  [
    {
      picture: "quartz",
      name: "Clear Quartz",
      theme: "crystal",
      lore: "A clear point to start with: it takes on whatever you set into it.",
      draw: A.quartz,
      bg: { colour: P.darkPurple, star: P.white },
    },
    {
      picture: "amethyst",
      name: "Amethyst",
      theme: "crystal",
      lore: "Kept by the bed for quiet dreams, and by the door for quiet visitors.",
      draw: A.amethyst,
      bg: { colour: P.navy, star: P.white },
    },
    {
      picture: "crystal-ball",
      name: "Crystal Ball",
      theme: "crystal",
      lore: "A glass full of slow purple weather, where small stars drift and settle.",
      draw: A.crystalBall,
      bg: { colour: P.navy, star: P.white },
    },
    {
      picture: "crystal-grid",
      name: "Charge",
      theme: "crystal",
      lore: "Six stones round a heart stone, laid out under the moon to gather its light.",
      draw: A.crystalGrid,
    },
  ],
  [
    {
      picture: "crescent",
      name: "Crescent",
      theme: "moon",
      lore: "The moon grows from here: a good night to begin something.",
      draw: B.crescentMoon,
      bg: { colour: P.navy, star: P.white },
    },
    {
      picture: "triple-moon",
      name: "Triple Moon",
      theme: "moon",
      lore: "Waxing, full and waning: beginnings, plenty and letting go.",
      draw: B.tripleMoon,
      bg: { colour: P.darkPurple, star: P.white },
    },
    {
      picture: "owl-moon",
      name: "Owl & Moon",
      theme: "moon",
      lore: "The owl keeps the night's hours so the witch can keep her own.",
      draw: B.owlAndMoon,
      bg: { colour: P.navy, star: P.white },
    },
    {
      picture: "as-above",
      name: "As Above",
      theme: "moon",
      lore: "What turns in the sky turns in the still water below it.",
      draw: B.asAbove,
    },
  ],
  [
    {
      picture: "toad",
      name: "Toad",
      theme: "familiar",
      lore: "A patient friend who knows every herb by the pond.",
      draw: B.toad,
      bg: { colour: P.blue, star: P.skyBlue },
    },
    {
      picture: "raven",
      name: "Raven",
      theme: "familiar",
      lore: "It remembers every face, and brings back the shiny things you lose.",
      draw: B.raven,
      bg: { colour: P.darkPurple, star: P.white },
    },
    {
      picture: "spider-web",
      name: "Spider Web",
      theme: "familiar",
      lore: "Weave slowly and well; what you need comes to the web.",
      draw: B.spiderWeb,
      bg: { colour: P.navy, star: P.white },
    },
    {
      picture: "samhain",
      name: "Samhain",
      theme: "familiar",
      lore: "The year turns and the veil grows thin: a lantern lights the way home.",
      draw: B.samhain,
    },
  ],
  [
    {
      picture: "pentacle",
      name: "Pentacle",
      theme: "ritual",
      lore: "Five points for earth, air, fire, water and spirit, held in one circle.",
      draw: B.pentacle,
      bg: { colour: P.navy, star: P.white },
    },
    {
      picture: "tarot-star",
      name: "The Star",
      theme: "astrology",
      lore: "After the storm, the Star: hope, poured out like water.",
      draw: B.tarotStar,
      bg: { colour: P.darkPurple, star: P.white },
    },
    {
      picture: "wheel-of-year",
      name: "Wheel of the Year",
      theme: "ritual",
      lore: "Eight festivals round the year, and every one a reason to gather.",
      draw: B.wheelOfYear,
      bg: { colour: P.navy, star: P.navy },
    },
    {
      picture: "grimoire",
      name: "So Mote It Be",
      theme: "ritual",
      lore: "Your own book at last, in your own hand. So mote it be.",
      draw: B.grimoire,
    },
  ],
];

/**
 * Fills every empty cell of `g` with `colour`, and puts a `star` on a sparse, fixed scatter of cells
 * that touch nothing but the background (so a star never sits against the art).
 */
function backdrop(g: Canvas, colour: string, star: string): void {
  const empty = (x: number, y: number) =>
    x < 0 || y < 0 || x >= g.w || y >= g.h || g.get(x, y) === null;
  const stars: [number, number][] = [];
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (
        (x * 7 + y * 13 + ((x * y) % 5)) % 23 === 0 &&
        empty(x, y) &&
        empty(x + 1, y) &&
        empty(x - 1, y) &&
        empty(x, y + 1) &&
        empty(x, y - 1)
      )
        stars.push([x, y]);
  g.fillEmpty(() => colour);
  for (const [x, y] of stars) g.set(x, y, star);
}

/** The board a picture plays on: the picture exactly as drawn, edge to edge (the walkway rings it). */
function board(spec: Spec): collect.CollectLevel {
  const g = spec.draw();
  if (spec.bg) backdrop(g, spec.bg.colour, spec.bg.star);
  const level = asLevel(`j-${spec.picture}`, g, {
    id: spec.picture,
    name: spec.name,
    theme: spec.theme,
    lore: spec.lore,
  });
  return withSharedTrays(toPictureBoard(level, { margin: false, scene: false }));
}

export const JOURNEY: readonly JourneyEntry[] = SPECS.flatMap((chapter, ci) =>
  chapter.map((spec, k) => {
    const tier = TIERS[k]!;
    return {
      id: `j-${spec.picture}`,
      name: spec.name,
      chapter: ci + 1,
      chapterName: CHAPTERS[ci]!,
      tier,
      base: () => board(spec),
      make: () => dealt(board(spec)),
    };
  }),
);

/** Journey levels by id. */
export const JOURNEY_BY_ID: ReadonlyMap<string, JourneyEntry> = new Map(
  JOURNEY.map((e) => [e.id, e]),
);

/** Hard or Extreme for a level id (shown on its stop, said as it opens, paid extra), else null. */
export function challengeOf(id: string): "hard" | "extreme" | null {
  const tier = JOURNEY_BY_ID.get(id)?.tier;
  return tier === "hard" || tier === "extreme" ? tier : null;
}

/** Each journey picture as drawn, by picture id (the Spellbook's key), built once on first use. */
const pictures = new Map<string, collect.CollectLevel>();

/** The journey level whose picture is `pictureId` (as drawn, for the Spellbook), or null. */
export function pictureLevel(pictureId: string): collect.CollectLevel | null {
  if (pictures.size === 0) for (const e of JOURNEY) pictures.set(e.id.slice(2), e.base());
  return pictures.get(pictureId) ?? null;
}
