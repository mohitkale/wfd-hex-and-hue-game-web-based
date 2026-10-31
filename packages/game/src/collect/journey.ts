import type * as collect from "@hexhue/core/collect";
import * as A from "./journeyArtA";
import * as B from "./journeyArtB";
import { asLevel, Canvas, upscale } from "./pixelCanvas";
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
  /**
   * The board at its design size, one cube per drawn cell, before its deal: what the dealing tool
   * searches (deals are recorded at this size, where the search is four times quicker).
   */
  design: () => collect.CollectLevel;
  /** The board as played (the finer mosaic, `FINE`), before its deal. */
  base: () => collect.CollectLevel;
  /** The level as played: the finer board with its recorded deal, scaled up (or a plain deal). */
  make: () => collect.CollectLevel;
}

/** A recorded deal: every column's boxes, front first, as `[colour, cubes]`, and any wax seals. */
export interface JourneyDeal {
  columns: number[][][];
  /** A winning line found by the solver at the design size (it wins the finer board too). */
  line?: unknown[];
  /** Set when no deal reached the level's tier: how far the closest winnable one is (see the report). */
  missed?: number;
  /** Wax seals: the cubes at `cells` wait until every box of colour `key` is finished. */
  seals?: collect.SealSpec[];
}

const DEALS = deals as Record<string, JourneyDeal>;

/** `level` with the deal recorded for it, if any (trays stay the board's own). */
export function dealt(
  level: collect.CollectLevel,
  deal: JourneyDeal | undefined = DEALS[level.id],
): collect.CollectLevel {
  if (!deal) return level;
  // A deal is recorded at the design size; on the finer board every cell is FINE × FINE cubes, so
  // every box holds FINE² times the cubes and every sealed cell seals its whole block.
  const f = Math.round(Math.sqrt(level.cells.length / designCells(level)));
  const designW = level.width / f;
  const block = (i: number) => {
    const x = (i % designW) * f;
    const y = Math.floor(i / designW) * f;
    const out: number[] = [];
    for (let dy = 0; dy < f; dy++)
      for (let dx = 0; dx < f; dx++) out.push((y + dy) * level.width + x + dx);
    return out;
  };
  return {
    ...level,
    ...(deal.seals
      ? {
          seals: deal.seals.map((s) => ({
            key: s.key,
            cells: s.cells.flatMap(block).sort((a, b) => a - b),
          })),
        }
      : {}),
    columns: deal.columns.map((c) =>
      c.map(([color, capacity]) => ({ color: color!, capacity: capacity! * f * f })),
    ),
  };
}

/** The largest number a box shows (owner rule: two digits). */
export const MAX_BOX = 99;

/** How far the level's recorded deal is from its tier when the search kept a closest one, else null. */
export const dealMissed = (id: string): number | null => DEALS[id]?.missed ?? null;

/** The recorded winning line of a level (design size; it wins the finer board too), or null. */
export const dealLine = (id: string): readonly collect.Action[] | null =>
  (DEALS[id]?.line as collect.Action[] | undefined) ?? null;

/**
 * The finer mosaic (owner request: cubes half the size): every drawn cell is played as FINE × FINE
 * cubes, so the picture keeps its size on screen with four times the cubes.
 */
export const FINE = 2;

/** Design-size cells of a level id's picture (its finer board divides by FINE²). */
const designSize = new Map<string, number>();
const designCells = (level: collect.CollectLevel): number =>
  designSize.get(level.id) ?? level.cells.length;

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
   * does in the win reveal): every empty cell becomes `colour`, with a scatter of `star` cells. Bright
   * and light (sky blue, pink, lilac, mint, parchment), so the outlined art pops; a finale draws its
   * own night scene and has none.
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
      bg: { colour: P.skyBlue, star: P.white },
    },
    {
      picture: "witchs-hat",
      name: "The Hat",
      theme: "ritual",
      lore: "Too big at first. It fits a little better after every spell.",
      draw: A.witchsHat,
      bg: { colour: P.pink, star: P.white },
    },
    {
      picture: "broom",
      name: "Besom",
      theme: "ritual",
      lore: "Before it ever flies, a besom sweeps: old dust out, fresh luck in.",
      draw: A.broom,
      bg: { colour: P.skyBlue, star: P.white },
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
      bg: { colour: P.skyBlue, star: P.white },
    },
    {
      picture: "mortar",
      name: "Mortar & Pestle",
      theme: "ritual",
      lore: "Grind slowly and think of what you want. The stone remembers.",
      draw: A.mortar,
      bg: { colour: P.lightPurple, star: P.white },
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
      bg: { colour: P.pink, star: P.white },
    },
    {
      picture: "amethyst",
      name: "Amethyst",
      theme: "crystal",
      lore: "Kept by the bed for quiet dreams, and by the door for quiet visitors.",
      draw: A.amethyst,
      bg: { colour: P.skyBlue, star: P.white },
    },
    {
      picture: "crystal-ball",
      name: "Crystal Ball",
      theme: "crystal",
      lore: "A glass full of slow purple weather, where small stars drift and settle.",
      draw: A.crystalBall,
      bg: { colour: P.lightGreen, star: P.white },
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
      bg: { colour: P.blue, star: P.white },
    },
    {
      picture: "triple-moon",
      name: "Triple Moon",
      theme: "moon",
      lore: "Waxing, full and waning: beginnings, plenty and letting go.",
      draw: B.tripleMoon,
      bg: { colour: P.lightPurple, star: P.white },
    },
    {
      picture: "owl-moon",
      name: "Owl & Moon",
      theme: "moon",
      lore: "The owl keeps the night's hours so the witch can keep her own.",
      draw: B.owlAndMoon,
      bg: { colour: P.skyBlue, star: P.white },
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
      bg: { colour: P.skyBlue, star: P.white },
    },
    {
      picture: "raven",
      name: "Raven",
      theme: "familiar",
      lore: "It remembers every face, and brings back the shiny things you lose.",
      draw: B.raven,
      bg: { colour: P.pink, star: P.white },
    },
    {
      picture: "spider-web",
      name: "Spider Web",
      theme: "familiar",
      lore: "Weave slowly and well; what you need comes to the web.",
      draw: B.spiderWeb,
      bg: { colour: P.purple, star: P.white },
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
      bg: { colour: P.skyBlue, star: P.white },
    },
    {
      picture: "tarot-star",
      name: "The Star",
      theme: "astrology",
      lore: "After the storm, the Star: hope, poured out like water.",
      draw: B.tarotStar,
      bg: { colour: P.pink, star: P.white },
    },
    {
      picture: "wheel-of-year",
      name: "Wheel of the Year",
      theme: "ritual",
      lore: "Eight festivals round the year, and every one a reason to gather.",
      draw: B.wheelOfYear,
      bg: { colour: P.tan, star: P.tan },
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
 * Fills the empty cells of `g` with `colour`, a `star` on a sparse, fixed scatter of cells that touch
 * nothing but the background (so a star never sits against the art). `band` cells along the board's
 * edges stay empty (a medium level is covered to about 85 %), and `stripe` lays diagonal bands of one of
 * the art's own colours through the backdrop (a hard level: the same colour in the picture and behind
 * it makes the order of the boxes matter, and the art looks the same).
 */
function backdrop(
  g: Canvas,
  colour: string,
  star: string,
  o: { band?: number; stripe?: string | null } = {},
): void {
  const band = o.band ?? 0;
  const inBand = (x: number, y: number) =>
    x < band || y < band || x >= g.w - band || y >= g.h - band;
  const empty = (x: number, y: number) =>
    x < 0 || y < 0 || x >= g.w || y >= g.h || g.get(x, y) === null;
  const stars: [number, number][] = [];
  const stripes: [number, number][] = [];
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (!empty(x, y) || inBand(x, y)) continue;
      if (o.stripe && (x + y) % 7 < 2) stripes.push([x, y]);
      else if (
        (x * 7 + y * 13 + ((x * y) % 5)) % 23 === 0 &&
        empty(x + 1, y) &&
        empty(x - 1, y) &&
        empty(x, y + 1) &&
        empty(x, y - 1)
      )
        stars.push([x, y]);
    }
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) if (empty(x, y) && !inBand(x, y)) g.set(x, y, colour);
  for (const [x, y] of stars) g.set(x, y, star);
  for (const [x, y] of stripes) g.set(x, y, o.stripe!);
}

/** The largest board side at the design size (the finer board is FINE times this, at most 72). */
const MAX_DESIGN = 36;

/**
 * The art centred on a larger board (owner feedback: the art takes about 55 to 70 % of the board, as
 * the board stays the same size on screen), with a margin of about an eighth of each side.
 */
function framed(drawn: Canvas): Canvas {
  const room = (n: number) =>
    Math.max(0, Math.min(Math.round(n * 0.13), Math.floor((MAX_DESIGN - n) / 2)));
  const mx = room(drawn.w);
  const my = room(drawn.h);
  const g = new Canvas(drawn.w + 2 * mx, drawn.h + 2 * my);
  for (let y = 0; y < drawn.h; y++)
    for (let x = 0; x < drawn.w; x++) g.set(x + mx, y + my, drawn.get(x, y));
  return g;
}

/** The art's most used colour that is neither its outline (black) nor `not`: the hard backdrop's stripe. */
function mainColour(g: Canvas, not: string): string | null {
  const count = new Map<string, number>();
  for (const c of g.cells)
    if (c && c !== P.black && c !== not) count.set(c, (count.get(c) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * The board a picture plays on. A finale fills its board with its own scene. Every other picture sits
 * in the middle of a larger board, covered by tier (owner feedback: the first levels teach the game
 * on few cubes): easy, the art alone on an empty board; medium, a backdrop with an empty band along
 * the edges (about 85 % covered); hard, the whole board, with stripes of one of the art's colours.
 */
function board(spec: Spec, tier: Tier, fine = 1): collect.CollectLevel {
  let drawn = spec.draw();
  if (spec.bg) {
    const stripe = tier === "hard" ? mainColour(drawn, spec.bg.colour) : null;
    drawn = framed(drawn);
    if (tier === "medium") backdrop(drawn, spec.bg.colour, spec.bg.star, { band: 1 });
    if (tier === "hard") backdrop(drawn, spec.bg.colour, spec.bg.star, { stripe });
  }
  designSize.set(`j-${spec.picture}`, drawn.w * drawn.h);
  const g = fine > 1 ? upscale(drawn, fine) : drawn;
  const level = asLevel(`j-${spec.picture}`, g, {
    id: spec.picture,
    name: spec.name,
    theme: spec.theme,
    lore: spec.lore,
  });
  // Trays and columns as on the finer board as played, also at the design size, where deals are found.
  const played = drawn.cells.filter((c) => c !== null).length * FINE * FINE;
  const out = withSharedTrays(toPictureBoard(level, { margin: false, scene: false }), played);
  // Four times the cubes: familiars leave their bottle twice as often, so a level takes about twice
  // as long, not four times.
  return fine > 1 ? { ...out, spawnGap: Math.max(1, Math.round(out.spawnGap / fine)) } : out;
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
      design: () => board(spec, tier),
      base: () => board(spec, tier, FINE),
      make: () => dealt(board(spec, tier, FINE)),
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
