/**
 * The Hex & Hue familiars (v2.0.0 look): a flying bat and a cat, drawn as smooth vector shapes
 * (`familiarDraw.ts`) into an atlas with one row per cube colour. This module holds what both species
 * share: the frame names and size, and the colour maths (a deep tint for the outline that always
 * reads on the dark board, and the tones used for fills). The sprite is laid out on a 16 x 14 unit
 * grid (the units the board's offsets and the colour-blind badge anchor are written in) and drawn
 * `SS` times larger so it stays crisp at any phone density.
 */

import { theme } from "../theme";

export const FAMILIAR_W = 16;
export const FAMILIAR_H = 14;
/** Supersampling: each unit is `SS` texture pixels in each direction. */
export const SS = 4;

/** The two species: bats fly for most worlds, cats trot for the `familiar` pictures. */
export const SPECIES = ["bat", "cat"] as const;
export type Species = (typeof SPECIES)[number];

/** Cats trot for the `familiar` pictures (and the world that is about familiars); every other picture is flown by bats. */
export const speciesFor = (theme: string | undefined): Species =>
  theme === "familiar" ? "cat" : "bat";

/** Role names of the tones a species is filled with. */
export type Role = "outline" | "light" | "mid" | "dark";

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
 * Where the M6.5 colourblind symbol is drawn on the familiar, in sprite units: the belly,
 * clear of the eyes and wings. The sprite colour alone cannot carry the matching rule for colour-vision
 * deficiency, so with colourblind mode on the renderer draws the colour's symbol here. A crouched
 * (`pickup`) frame has a shorter torso.
 */
export function badgeRect(frame: FrameName): Rect {
  return frame === "pickup"
    ? { x: 5.4, y: 9.9, w: 5.2, h: 2.2 }
    : { x: 5.4, y: 8.6, w: 5.2, h: 2.6 };
}

/**
 * Device-pixel size of one sprite unit so the sprite is about `targetCss` CSS pixels wide (the
 * 20-28 px band the board is designed for).
 */
export function familiarScale(dpr: number, targetCss = 24): number {
  return Math.max(1, (targetCss * dpr) / FAMILIAR_W);
}
