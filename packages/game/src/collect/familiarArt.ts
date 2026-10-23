/**
 * The Hex & Hue familiar ("Mothlet"): a small round moth-sprite that fetches cubes. Original pixel
 * art, authored here as ASCII layers that are composed into frames. Body pixels use a ramp tinted per
 * cube colour (outline included, as a deep tint, so the silhouette reads on the dark board); eyes,
 * wings and the antenna glow are fixed, so one design serves every colour. See docs/art/familiar.md.
 */

import { theme } from "../theme";

export const FAMILIAR_W = 16;
export const FAMILIAR_H = 14;

/** Legend: which role each character plays. `.` is transparent. */
export const LEGEND = {
  o: "outline",
  l: "light",
  m: "mid",
  d: "dark",
  c: "cheek",
  e: "eyeWhite",
  p: "pupil",
  w: "wing",
  x: "wingEdge",
  g: "glow",
} as const;
export type Role = (typeof LEGEND)[keyof typeof LEGEND];

export const FRAME_NAMES = [
  "idle0",
  "idle1",
  "walk0",
  "walk1",
  "carry0",
  "carry1",
  "pickup",
  "deliver",
] as const;
export type FrameName = (typeof FRAME_NAMES)[number];

// ---------------------------------------------------------------------------------------------
// Layers (16 × 14). Wings and arms are written as the left half (8 columns) and mirrored.
// ---------------------------------------------------------------------------------------------

const blank = (): string[] => Array.from({ length: FAMILIAR_H }, () => ".".repeat(FAMILIAR_W));

/** Body: head and torso, antennae, standing feet. Columns 4..11 are the 8-wide body. */
const BODY: readonly string[] = [
  "...g........g...",
  "....o......o....",
  ".....o....o.....",
  ".....oooooo.....",
  "....ollllmmo....",
  "....oeemmeeo....",
  "....oepmmpeo....",
  "....ocmmmmco....",
  "....olmmmmdo....",
  "....ommmmmdo....",
  "....oddmmddo....",
  ".....oooooo.....",
  ".....oo..oo.....",
  "................",
];

const mirror = (half: string): string => half + [...half].reverse().join("");

const halves = (rows: Record<number, string>): string[] =>
  blank().map((_, y) => (rows[y] ? mirror(rows[y]!) : ".".repeat(FAMILIAR_W)));

const WINGS_UP = halves({
  1: "x.......",
  2: "xw......",
  3: "xww.....",
  4: "xwww....",
  5: ".xwww...",
  6: "..xwww..",
  7: "...xwww.",
  8: "....xww.",
});

const WINGS_MID = halves({
  4: "x.......",
  5: "xww.....",
  6: "xwwww...",
  7: "xwwwww..",
  8: ".xwwww..",
  9: "..xxx...",
});

/** Wings half open and one step lower: the second beat of the walk's flap. */
const WINGS_MID_LOW = halves({
  6: "x.......",
  7: "xww.....",
  8: "xwwww...",
  9: "xwwwww..",
  10: ".xwwww..",
  11: "..xxx...",
});

const WINGS_DOWN = halves({
  5: "...xwww.",
  6: "..xwwww.",
  7: ".xwwww..",
  8: "xwwww...",
  9: "xwww....",
  10: "xww.....",
  11: "xw......",
  12: "x.......",
});

/** Wings folded back behind the body (crouching to pick something up). */
const WINGS_TUCK = halves({
  4: "...x....",
  5: "..xwx...",
  6: "..xww...",
  7: "..xww...",
  8: "...xw...",
});

/**
 * Arms raised in a V, holding the cube above the head. Drawn behind the body so the body outline
 * stays intact; the hands (rows 2-3) sit beside the antennae, outside the cube's footprint.
 */
const ARMS_V = halves({
  2: ".om.....",
  3: ".om.....",
  4: ".om.....",
  5: "..om....",
  6: "..om....",
  7: "...om...",
  8: "...om...",
});

/** Arms thrown straight up (delivery toss), with a sparkle at each hand. */
const ARMS_TOSS = halves({
  0: "g.......",
  1: "om......",
  2: "om......",
  3: "om......",
  4: "om......",
  5: "om......",
  6: ".om.....",
  7: "..om....",
  8: "..om....",
});

/** Arms reaching out and down for a cube on the ground. */
const ARMS_REACH = halves({
  9: "..om....",
  10: ".omm....",
  11: "omm.....",
  12: "om......",
});

const FEET_APART = "....oo....oo....";
const FEET_TOGETHER = "......oooo......";

/** Draws `top` over `base` where `top` is not transparent. */
function overlay(base: readonly string[], top: readonly string[]): string[] {
  return base.map((row, y) =>
    [...row].map((ch, x) => (top[y]![x] !== "." ? top[y]![x]! : ch)).join(""),
  );
}

/** Replaces row `y` of `rows`. */
const withRow = (rows: readonly string[], y: number, row: string): string[] =>
  rows.map((r, i) => (i === y ? row : r));

/** Crouched: a row of the torso is removed and everything above it moves down. */
function squash(rows: readonly string[]): string[] {
  const out = [...rows.slice(0, 9), ...rows.slice(10)];
  return ["................", ...out];
}

const stack = (...layers: (readonly string[])[]): string[] =>
  layers.reduce<string[]>((acc, layer) => overlay(acc, layer), blank());

/** The body with its feet row replaced. */
const bodyWithFeet = (feet: string): string[] => withRow(BODY, 12, feet);

export const FRAMES: Record<FrameName, readonly string[]> = {
  idle0: stack(WINGS_UP, BODY),
  idle1: stack(WINGS_DOWN, BODY),
  // Walking: feet wide apart, then together; the wings beat between two half-open positions.
  walk0: stack(WINGS_MID, bodyWithFeet(FEET_APART)),
  walk1: stack(WINGS_MID_LOW, bodyWithFeet(FEET_TOGETHER)),
  // Carrying: arms in a V under the cube; wings flap low so they never hide the arms.
  carry0: stack(WINGS_MID, ARMS_V, BODY),
  carry1: stack(WINGS_DOWN, ARMS_V, BODY),
  // Picking up: crouched, wings tucked, arms reaching down.
  pickup: stack(squash(WINGS_TUCK), squash(ARMS_REACH), squash(BODY)),
  // Delivering: wings wide, arms thrown up with sparkles. The feet stay on the baseline.
  deliver: stack(WINGS_UP, ARMS_TOSS, BODY),
};

// ---------------------------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------------------------

export type Rgb = readonly [number, number, number];

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  clamp(a[0] + (b[0] - a[0]) * t),
  clamp(a[1] + (b[1] - a[1]) * t),
  clamp(a[2] + (b[2] - a[2]) * t),
];

/** The fixed (colour-independent) parts of the palette. */
export const FIXED = {
  eyeWhite: [255, 255, 255] as Rgb,
  pupil: [26, 15, 51] as Rgb,
  wing: [226, 214, 255] as Rgb,
  wingEdge: [150, 130, 220] as Rgb,
  glow: [246, 217, 122] as Rgb,
  /** A warm pink that reads on every body colour (a derived cheek turned grey on green). */
  cheek: [255, 172, 205] as Rgb,
} as const;

const NIGHT: Rgb = [26, 15, 51];
/** The board panel the familiar is drawn over. */
export const PANEL: Rgb = [(theme.panel >> 16) & 255, (theme.panel >> 8) & 255, theme.panel & 255];
/**
 * The outline must stay at least this much lighter than the panel (WCAG contrast). Same floor as
 * the art pipeline's panel check (tools/art/check.ts), so every shipped colour can meet it.
 */
export const MIN_OUTLINE_CONTRAST = 1.6;

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: Rgb) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
/** WCAG contrast ratio (1..21). */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Parses `#rrggbb` (anything else throws: a bare or short hex would silently give wrong colours). */
export function parseHex(hex: string): Rgb {
  if (!/^#[0-9a-f]{6}$/i.test(hex))
    throw new Error(`familiar colour must be #rrggbb, got "${hex}"`);
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A deep tint of the colour for the outline, lightened toward the colour until it shows on the panel. */
function outlineFor(base: Rgb): Rgb {
  for (let t = 0.5; t >= 0; t -= 0.05) {
    const c = mix(base, NIGHT, t);
    if (contrast(c, PANEL) >= MIN_OUTLINE_CONTRAST) return c;
  }
  return base;
}

/** Colours for each role, for a familiar carrying cubes of `colorHex`. */
export function palette(colorHex: string): Record<Role, Rgb> {
  const base = parseHex(colorHex);
  return {
    ...FIXED,
    mid: base,
    light: mix(base, [255, 255, 255], 0.45),
    dark: mix(base, NIGHT, 0.4),
    outline: outlineFor(base),
  };
}

// ---------------------------------------------------------------------------------------------
// Colourblind badge anchor and phone scale
// ---------------------------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the M6.5 colourblind symbol is drawn on the familiar, in native sprite pixels: the chest,
 * clear of the eyes and wings. The sprite colour alone cannot carry the matching rule for colour-vision
 * deficiency, so with colourblind mode on the renderer draws the colour's symbol here. A crouched
 * (`pickup`) frame has a shorter torso.
 */
export function badgeRect(frame: FrameName): Rect {
  return frame === "pickup" ? { x: 5, y: 8, w: 6, h: 3 } : { x: 5, y: 7, w: 6, h: 4 };
}

/**
 * Whole-number device-pixel scale for the sprite so it is about `targetCss` CSS pixels wide (the
 * 20-28 px band the board is designed for): 2× at dpr 1 (32 px), 3× at dpr 2 (24 px), 5× at dpr 3
 * (27 px). Integer scales keep nearest-neighbour pixels even.
 */
export function familiarScale(dpr: number, targetCss = 24): number {
  return Math.max(1, Math.round((targetCss * dpr) / FAMILIAR_W));
}

/** One frame as RGBA bytes (row-major; transparent pixels have alpha 0). */
export function frameRgba(name: FrameName, colorHex: string): Uint8ClampedArray {
  const pal = palette(colorHex);
  const out = new Uint8ClampedArray(FAMILIAR_W * FAMILIAR_H * 4);
  FRAMES[name].forEach((row, y) => {
    for (let x = 0; x < FAMILIAR_W; x++) {
      const ch = row[x]!;
      if (ch === ".") continue;
      const [r, g, b] = pal[LEGEND[ch as keyof typeof LEGEND]];
      const i = (y * FAMILIAR_W + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  });
  return out;
}
