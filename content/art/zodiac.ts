import type { AsciiArt } from "@hexhue/core";
import { Canvas, sprinkle } from "./draw";

// Zodiac Realm palette.
const sky = "#4b3c9e";
const starlight = "#c9b8ff";
const glyphWhite = "#ffffff";
const gold = "#f6d97a";
const violet = "#7a4fd0";

/** Element colors for the sign medallions. */
const ELEMENT = {
  fire: "#e85d3a",
  earth: "#5fa05a",
  // Deep amber, so the white glyph stays readable on air medallions.
  air: "#c98f1a",
  water: "#3a86ff",
} as const;

/** Hand-drawn 9×9 glyphs; "g" is the glyph, "." transparent. */
const GLYPHS = {
  aries: [
    ".........",
    ".gg...gg.",
    "g..g.g..g",
    "g...g...g",
    "....g....",
    "....g....",
    "....g....",
    "....g....",
    ".........",
  ],
  taurus: [
    "g.......g",
    ".g.....g.",
    "..ggggg..",
    ".g.....g.",
    "g.......g",
    "g.......g",
    ".g.....g.",
    "..ggggg..",
    ".........",
  ],
  gemini: [
    "ggggggggg",
    "..g...g..",
    "..g...g..",
    "..g...g..",
    "..g...g..",
    "..g...g..",
    "..g...g..",
    "..g...g..",
    "ggggggggg",
  ],
  cancer: [
    "...gggg..",
    ".gg....g.",
    "g..g.....",
    "g..g.....",
    ".gg...gg.",
    ".....g..g",
    ".....g..g",
    ".g....gg.",
    "..gggg...",
  ],
  leo: [
    "..ggg....",
    ".g...g...",
    ".g...g...",
    "..g..g...",
    ".....g...",
    ".....g..g",
    "......g.g",
    ".......g.",
    ".........",
  ],
  virgo: [
    ".........",
    "g.gg.gg..",
    "gg.gg.gg.",
    "g..g..g..",
    "g..g..gg.",
    "g..g..g.g",
    "g..g..g.g",
    "g..g..gg.",
    ".....gg..",
  ],
  libra: [
    ".........",
    "...ggg...",
    "..g...g..",
    "..g...g..",
    "ggg...ggg",
    ".........",
    "ggggggggg",
    ".........",
    ".........",
  ],
  scorpio: [
    ".........",
    "g.gg.gg..",
    "gg.gg.gg.",
    "g..g..g..",
    "g..g..g..",
    "g..g..g..",
    "g..g..g.g",
    "g..g...gg",
    "......ggg",
  ],
  sagittarius: [
    "....ggggg",
    "......ggg",
    ".....g.gg",
    "....g...g",
    ".g.g.....",
    "..g......",
    ".g.g.....",
    "g........",
    ".........",
  ],
  capricorn: [
    ".........",
    "g...g....",
    ".g.g.g...",
    "..g..g...",
    ".....g.gg",
    ".....gg.g",
    ".....g..g",
    "....g.gg.",
    "...g.....",
  ],
  aquarius: [
    ".........",
    ".........",
    ".g..g..g.",
    "g.gg.gg.g",
    ".........",
    ".g..g..g.",
    "g.gg.gg.g",
    ".........",
    ".........",
  ],
  pisces: [
    "g.......g",
    ".g.....g.",
    "..g...g..",
    "..g...g..",
    "ggggggggg",
    "..g...g..",
    "..g...g..",
    ".g.....g.",
    "g.......g",
  ],
} as const;

/** A sign: its glyph on an element-colored medallion under a starry sky. */
function sign(glyph: keyof typeof GLYPHS, element: keyof typeof ELEMENT, seed: number): AsciiArt {
  return sprinkle(new Canvas(15, 15, "n"), "s", 0.08, seed, "n")
    .disc(7, 7, 6.6, "e")
    .stamp(3, 3, [...GLYPHS[glyph]])
    .art({ n: sky, s: starlight, e: ELEMENT[element], g: glyphWhite });
}

export const aries = sign("aries", "fire", 301);
export const taurus = sign("taurus", "earth", 302);
export const gemini = sign("gemini", "air", 303);
export const cancer = sign("cancer", "water", 304);
export const leo = sign("leo", "fire", 305);
export const virgo = sign("virgo", "earth", 306);
export const libra = sign("libra", "air", 307);
export const scorpio = sign("scorpio", "water", 308);
export const sagittarius = sign("sagittarius", "fire", 309);
export const capricorn = sign("capricorn", "earth", 310);
export const aquarius = sign("aquarius", "air", 311);
export const pisces = sign("pisces", "water", 312);

export const northStar = sprinkle(new Canvas(14, 14, "n"), "s", 0.08, 313, "n")
  .star(6.5, 6.5, 6.4, 1.6, 4, "y")
  .star(6.5, 6.5, 4, 1.3, 4, "w")
  .disc(6.5, 6.5, 1.1, "y")
  .art({ n: sky, s: starlight, y: gold, w: glyphWhite });

/** Seven stars joined by lines: the ladle of the Great Bear. */
export const bigDipper = (() => {
  const stars: [number, number][] = [
    [1, 4],
    [5, 2],
    [9, 4],
    [12, 6],
    [12, 11],
    [17, 11],
    [17, 6],
  ];
  const c = new Canvas(19, 13, "n");
  for (let i = 0; i < stars.length - 1; i++) {
    const [x0, y0] = stars[i]!;
    const [x1, y1] = stars[i + 1]!;
    c.line(x0, y0, x1, y1, "l");
  }
  c.line(12, 6, 17, 6, "l");
  for (const [x, y] of stars) c.disc(x, y, 1.1, "y");
  return c.art({ n: sky, l: violet, y: gold });
})();

export const orion = (() => {
  const c = new Canvas(14, 16, "n");
  const pts: Record<string, [number, number]> = {
    shoulderL: [3, 2],
    shoulderR: [10, 3],
    belt1: [5, 8],
    belt2: [6.5, 7.5],
    belt3: [8, 7],
    footL: [3, 14],
    footR: [11, 13],
  };
  const link = (a: string, b: string) => c.line(...pts[a]!, ...pts[b]!, "l");
  link("shoulderL", "belt1");
  link("shoulderR", "belt3");
  link("belt1", "footL");
  link("belt3", "footR");
  link("belt1", "belt3");
  for (const [k, [x, y]] of Object.entries(pts)) {
    c.disc(x, y, k.startsWith("belt") ? 0.8 : 1.2, k === "shoulderL" ? "r" : "y");
  }
  return sprinkle(c, "s", 0.05, 315, "n").art({
    n: sky,
    l: violet,
    y: glyphWhite,
    r: ELEMENT.fire,
    s: starlight,
  });
})();

export const saturn = sprinkle(new Canvas(18, 12, "n"), "s", 0.07, 316, "n")
  .ellipse(8.5, 6, 8.3, 2.4, "r")
  .ellipse(8.5, 6, 6.6, 1.5, "n")
  .disc(8.5, 5.5, 3.8, "p")
  // The ring's front arc crosses the lower half of the planet.
  .where((x, y) => {
    const outer = ((x - 8.5) / 8.3) ** 2 + ((y - 6) / 2.4) ** 2 <= 1;
    const inner = ((x - 8.5) / 6.6) ** 2 + ((y - 6) / 1.5) ** 2 <= 1;
    return outer && !inner && y >= 6;
  }, "r")
  .rect(1, 6, 4, 1, "r")
  .rect(13, 6, 4, 1, "r")
  .art({ n: sky, s: starlight, r: gold, p: "#d4a373" });

export const sunAndMoon = (() => {
  const c = new Canvas(18, 12, "n").star(5, 6, 5.2, 3.4, 10, "o").disc(5, 6, 3.2, "y");
  c.disc(14, 6, 4.2, "m").disc(15.8, 5, 3.6, "n");
  return sprinkle(c, "s", 0.06, 317, "n").art({
    n: sky,
    o: ELEMENT.fire,
    y: gold,
    m: "#dfe6f0",
    s: starlight,
  });
})();

export const astrolabe = new Canvas(15, 15, "n")
  .disc(7, 7, 7, "y")
  .disc(7, 7, 5.8, "b")
  .ring(7, 7, 4.2, 1, "y")
  .disc(7, 7, 2.2, "w")
  .line(2, 7, 12, 7, "y")
  .line(7, 2, 7, 12, "y")
  .disc(7, 7, 0.8, "y")
  .art({ n: sky, y: gold, b: ELEMENT.water, w: glyphWhite });

export const comet = sprinkle(new Canvas(18, 12, "n"), "s", 0.06, 319, "n")
  .poly(
    [
      [1, 11],
      [12, 3],
      [14, 5],
    ],
    "t",
  )
  .poly(
    [
      [5, 10],
      [12, 4],
      [13, 5],
    ],
    "w",
  )
  .disc(13, 3.6, 2, "y")
  .art({ n: sky, s: starlight, t: violet, w: glyphWhite, y: gold });

/** The finale: twelve segments colored by element around a white hub, Aries at the top. */
export const zodiacWheel = (() => {
  const order = ["f", "e", "a", "w"];
  const c = new Canvas(18, 18, "n");
  c.where((x, y) => {
    const d = Math.hypot(x - 8.5, y - 8.5);
    return d <= 8.6 && d > 3.2;
  }, "x");
  for (let k = 0; k < 12; k++) {
    const ch = order[k % 4]!;
    c.where((x, y) => {
      if (c.get(x, y) !== "x") return false;
      const a = (Math.atan2(y - 8.5, x - 8.5) + Math.PI * 2.5) % (Math.PI * 2);
      return Math.floor(a / (Math.PI / 6)) === k;
    }, ch);
  }
  return sprinkle(c.disc(8.5, 8.5, 3, "y"), "s", 0.12, 320, "n").art({
    // The hub is white: gold would be too close to the air signs' yellow.
    n: sky,
    s: starlight,
    f: ELEMENT.fire,
    e: ELEMENT.earth,
    a: ELEMENT.air,
    w: ELEMENT.water,
    y: glyphWhite,
  });
})();
