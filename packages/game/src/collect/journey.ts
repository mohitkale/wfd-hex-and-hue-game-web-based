import * as collect from "@hexhue/core/collect";
import * as A from "./journeyArtA";
import * as B from "./journeyArtB";
import { asLevel, Canvas } from "./pixelCanvas";
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
  /** The board as played, before its deal: what the dealing tool searches. */
  base: () => collect.CollectLevel;
  /** The level as played: the board with its recorded deal (or a plain deal). */
  make: () => collect.CollectLevel;
}

/** A recorded deal: every column's boxes, front first, as `[colour, cubes]`, and any wax seals. */
export interface JourneyDeal {
  columns: number[][][];
  /** A winning line found by the solver (the production gate replays it). */
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
  return {
    ...level,
    ...(deal.seals ? { seals: deal.seals } : {}),
    columns: deal.columns.map((c) =>
      c.map(([color, capacity]) => ({ color: color!, capacity: capacity! })),
    ),
  };
}

/** The largest number a box shows (owner rule: two digits). */
export const MAX_BOX = 99;

/** How far the level's recorded deal is from its tier when the search kept a closest one, else null. */
export const dealMissed = (id: string): number | null => DEALS[id]?.missed ?? null;

/** The recorded winning line of a level, or null. */
export const dealLine = (id: string): readonly collect.Action[] | null =>
  (DEALS[id]?.line as collect.Action[] | undefined) ?? null;

/**
 * The most cubes a level of each tier is drawn with (owner feedback: a level may take longer for its
 * difficulty, never for its number of cubes). Every picture is drawn at the largest scale, at most
 * `MAX_SCALE`, that keeps it within its budget.
 */
export const CUBE_BUDGET: Record<Tier, number> = {
  easy: 900,
  medium: 1300,
  hard: 1700,
  extreme: 2000,
};

/** The largest drawing scale: cubes at most half a design cell (owner request: small cubes). */
export const MAX_SCALE = 2;
const MIN_SCALE = 1;

/** How far the backdrop reaches round the art, in design cells, by tier (easy: none). */
const HALO: Record<Tier, number> = { easy: 0, medium: 1.5, hard: 3, extreme: 0 };

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
 * Distance in cubes from every cube to the nearest filled one (a two-pass chamfer: 1 straight, 1.4
 * diagonal), for the halo of backdrop round the art.
 */
function distances(g: Canvas): Float64Array {
  const d = new Float64Array(g.w * g.h).fill(Infinity);
  g.cells.forEach((c, i) => {
    if (c !== null) d[i] = 0;
  });
  const pass = (steps: readonly [number, number, number][], ys: number[], xs: number[]) => {
    for (const y of ys)
      for (const x of xs)
        for (const [dx, dy, w] of steps) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < g.w && ny < g.h)
            d[y * g.w + x] = Math.min(d[y * g.w + x]!, d[ny * g.w + nx]! + w);
        }
  };
  const ys = [...Array(g.h).keys()];
  const xs = [...Array(g.w).keys()];
  pass(
    [
      [-1, 0, 1],
      [0, -1, 1],
      [-1, -1, 1.4],
      [1, -1, 1.4],
    ],
    ys,
    xs,
  );
  pass(
    [
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 1.4],
      [-1, 1, 1.4],
    ],
    ys.reverse(),
    xs.reverse(),
  );
  return d;
}

/**
 * A backdrop round the art (owner feedback: no rings of cubes the picture does not need): the empty
 * cubes within `reach` cubes of the art become `colour`, with a `star` on a sparse, fixed scatter of
 * cubes that touch nothing but the backdrop, and, for a hard level, diagonal bands of one of the art's
 * own colours (`stripe`: the same colour in the picture and behind it makes the order of the boxes
 * matter, and the art looks the same).
 */
function backdrop(
  g: Canvas,
  reach: number,
  colour: string,
  star: string,
  stripe: string | null,
): void {
  const d = distances(g);
  const halo = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < g.w && y < g.h && d[y * g.w + x]! > 0 && d[y * g.w + x]! <= reach;
  const band = Math.max(5, Math.round(reach * 2.4));
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (!halo(x, y)) continue;
      const lone =
        (x * 7 + y * 13 + ((x * y) % 5)) % 23 === 0 &&
        d[y * g.w + x]! > 1.5 &&
        halo(x + 1, y) &&
        halo(x - 1, y) &&
        halo(x, y + 1) &&
        halo(x, y - 1);
      g.set(x, y, stripe && (x + y) % band < 2 ? stripe : lone ? star : colour);
    }
}

/** The largest board side in cubes. */
const MAX_SIDE = collect.COLLECT_LIMITS.maxSize;

/**
 * The art centred on a larger board (owner feedback: the art takes about 55 to 70 % of the board, as
 * the board stays the same size on screen), with a margin of about an eighth of each side, and at
 * least `room` cubes for the backdrop.
 */
function framed(drawn: Canvas, room: number): Canvas {
  const margin = (n: number) =>
    Math.max(0, Math.min(Math.max(Math.round(n * 0.13), room), Math.floor((MAX_SIDE - n) / 2)));
  const mx = margin(drawn.w);
  const my = margin(drawn.h);
  const g = Canvas.render(1, () => new Canvas(drawn.w + 2 * mx, drawn.h + 2 * my));
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

/** The picture of `spec` for a `tier` level, drawn at `scale`: framed and backed as the tier asks. */
function picture(spec: Spec, tier: Tier, scale: number): Canvas {
  let g = Canvas.render(scale, spec.draw);
  if (spec.bg) {
    const reach = HALO[tier] * scale;
    const stripe = tier === "hard" ? mainColour(g, spec.bg.colour) : null;
    g = framed(g, Math.ceil(reach) + 1);
    if (reach > 0) backdrop(g, reach, spec.bg.colour, spec.bg.star, stripe);
  }
  return g;
}

/** The scale each picture is drawn at, found once. */
const scales = new Map<string, number>();

/** The largest scale (in steps of 0.05) at which the picture fits its tier's cube budget and the board. */
function scaleFor(spec: Spec, tier: Tier): number {
  const known = scales.get(spec.picture);
  if (known !== undefined) return known;
  let scale = MAX_SCALE;
  for (; scale > MIN_SCALE; scale = Math.round((scale - 0.05) * 100) / 100) {
    const g = picture(spec, tier, scale);
    const cubes = g.cells.filter((c) => c !== null).length;
    if (cubes <= CUBE_BUDGET[tier] && g.w <= MAX_SIDE && g.h <= MAX_SIDE) break;
  }
  scales.set(spec.picture, scale);
  return scale;
}

/**
 * The board a picture plays on. A finale fills its board with its own scene. Every other picture sits
 * in the middle of a larger board (owner feedback: the art about 55 to 70 % of it), backed by tier:
 * easy, the art alone; medium, a narrow band of backdrop round it; hard, a wider one, with stripes of
 * one of the art's colours. Each is drawn at the scale that fits its tier's cube budget.
 */
function board(spec: Spec, tier: Tier): collect.CollectLevel {
  const g = picture(spec, tier, scaleFor(spec, tier));
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
      base: () => board(spec, tier),
      make: () => dealt(board(spec, tier)),
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
