/**
 * The Hex & Hue familiar ("Mothlet"): a small round moth-sprite that fetches cubes. Original pixel
 * art, authored here as ASCII layers that are composed into frames. Body pixels use a ramp tinted per
 * cube colour (outline included, as a deep tint, so the silhouette reads on the dark board); eyes,
 * wings and the antenna glow are fixed, so one design serves every colour. See docs/art/familiar.md.
 */

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

const ARMS_UP = halves({
  1: "...mo...",
  2: "...m....",
  3: "...m....",
  4: "...m....",
  5: "...m....",
});

const ARMS_REACH = halves({
  8: "..mm....",
  9: ".mmo....",
  10: ".mo.....",
});

const FEET_STEP_A = ".....oo.........";
const FEET_STEP_B = "..........oo.....";

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

/** Stretched: a torso row is repeated and the empty bottom row is dropped. */
function stretch(rows: readonly string[]): string[] {
  const out = [...rows.slice(0, 9), rows[9]!, ...rows.slice(9, 13)];
  return out.slice(0, FAMILIAR_H);
}

const stack = (...layers: (readonly string[])[]): string[] =>
  layers.reduce<string[]>((acc, layer) => overlay(acc, layer), blank());

export const FRAMES: Record<FrameName, readonly string[]> = {
  idle0: stack(WINGS_UP, BODY),
  idle1: stack(WINGS_DOWN, BODY),
  walk0: stack(WINGS_MID, withRow(BODY, 12, FEET_STEP_A)),
  walk1: stack(WINGS_MID, withRow(BODY, 12, FEET_STEP_B)),
  carry0: stack(WINGS_UP, BODY, ARMS_UP),
  carry1: stack(WINGS_DOWN, BODY, ARMS_UP),
  pickup: stack(squash(WINGS_DOWN), squash(BODY), squash(ARMS_REACH)),
  deliver: stack(WINGS_UP, stretch(BODY), ARMS_UP),
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

export function parseHex(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The fixed (colour-independent) parts of the palette. */
export const FIXED = {
  eyeWhite: [255, 255, 255] as Rgb,
  pupil: [26, 15, 51] as Rgb,
  wing: [226, 214, 255] as Rgb,
  wingEdge: [150, 130, 220] as Rgb,
  glow: [246, 217, 122] as Rgb,
} as const;

const NIGHT: Rgb = [26, 15, 51];

/** Colours for each role, for a familiar carrying cubes of `colorHex`. */
export function palette(colorHex: string): Record<Role, Rgb> {
  const base = parseHex(colorHex);
  return {
    ...FIXED,
    mid: base,
    light: mix(base, [255, 255, 255], 0.45),
    dark: mix(base, NIGHT, 0.4),
    outline: mix(base, NIGHT, 0.62),
    cheek: mix(base, [255, 150, 190], 0.5),
  };
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
