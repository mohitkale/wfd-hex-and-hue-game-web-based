import { distance, parseHex, toHex, type Rgb } from "./color";

/** Shade roles inside a colour family, darkest to lightest (docs/ART_DIRECTION_V2.md §3). */
export const ROLES = ["deep", "shade", "base", "light", "glint"] as const;
export type Role = (typeof ROLES)[number];

export type Ramp = Record<Role, string>;
/** A custom ramp may leave out shades it does not use, but always has a base (the gameplay colour). */
export type PartialRamp = Partial<Ramp> & { base: string };

/**
 * The house families: bases, and ramps mixed from them toward the board's deep violet (50 % and
 * 28 %) and toward white (35 % and 65 %). The literal hexes are the table in ART_DIRECTION_V2 §3;
 * `houseRamp` regenerates them so a test can prove the table and the rule have not drifted apart.
 */
export const HOUSE_BASES: Record<string, string> = {
  Ruby: "#e0455f",
  Ember: "#ff8a3d",
  Gold: "#f6c945",
  Moss: "#5cbf5a",
  Teal: "#2fc4b2",
  Sapphire: "#4a82e8",
  Amethyst: "#9a5fe0",
  Rose: "#f27ac0",
  Moonstone: "#c9bde6",
  Night: "#5d5680",
};

const DEEP_VIOLET: Rgb = [0x1c, 0x0f, 0x3a];
const WHITE: Rgb = [255, 255, 255];
const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  [0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * t) as Rgb;

export function houseRamp(base: string): Ramp {
  const m = parseHex(base);
  return {
    deep: toHex(mix(m, DEEP_VIOLET, 0.5)),
    shade: toHex(mix(m, DEEP_VIOLET, 0.28)),
    base,
    light: toHex(mix(m, WHITE, 0.35)),
    glint: toHex(mix(m, WHITE, 0.65)),
  };
}

export const HOUSE_FAMILIES: Record<string, Ramp> = Object.fromEntries(
  [
    ["Ruby", "#7e2a4d", "#a93655", "#eb8697", "#f4bec7"],
    ["Ember", "#8e4d3c", "#bf683c", "#ffb381", "#ffd6bb"],
    ["Gold", "#896c40", "#b99542", "#f9dc86", "#fcecbe"],
    ["Moss", "#3c674a", "#4a8e51", "#95d594", "#c6e9c5"],
    ["Teal", "#266a76", "#2a9190", "#78d9cd", "#b6eae4"],
    ["Sapphire", "#334991", "#3d62b7", "#89aef0", "#c0d3f7"],
    ["Amethyst", "#5b378d", "#7749b2", "#bd97eb", "#dcc7f4"],
    ["Rose", "#87457d", "#b65c9a", "#f7a9d6", "#fad0e9"],
    ["Moonstone", "#736690", "#998cb6", "#dcd4ef", "#ece8f6"],
    ["Night", "#3d335d", "#4b426c", "#9691ac", "#c6c4d3"],
  ].map(([name, deep, shade, light, glint]) => [
    name!,
    { deep: deep!, shade: shade!, base: HOUSE_BASES[name!]!, light: light!, glint: glint! },
  ]),
);

/** Families whose hue is not meaningful (near neutral); exempt from the hue-drift rule (A-15). */
export const NEUTRAL_FAMILIES = new Set(["Moonstone", "Night"]);

/** Hue in degrees (0..360) of an sRGB colour; 0 for greys. */
export function hue([r, g, b]: Rgb): number {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  if (d === 0) return 0;
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return (h * 60 + 360) % 360;
}

export const hueDistance = (a: Rgb, b: Rgb): number => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const gam = (v: number) =>
  Math.round(
    255 * Math.max(0, Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)),
  );

/** Deuteranopia simulation: Machado et al. (2009), severity 1.0, in linear RGB (as in M10.1). */
export function deuteranopia(c: Rgb): Rgb {
  const [r, g, b] = [lin(c[0]), lin(c[1]), lin(c[2])];
  return [
    gam(0.367322 * r + 0.860646 * g - 0.227968 * b),
    gam(0.280085 * r + 0.672501 * g + 0.047413 * b),
    gam(-0.01182 * r + 0.04294 * g + 0.968881 * b),
  ];
}

/** WCAG relative luminance of an sRGB colour. */
export const luminance = (c: Rgb): number =>
  0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

export const luminanceRatio = (a: Rgb, b: Rgb): number => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** The closest (family, role) among the house ramps to `rgb`, and how far away it is. */
export function nearestHouseShade(rgb: Rgb): { family: string; role: Role; distance: number } {
  let best = { family: "Night", role: "base" as Role, distance: Infinity };
  for (const [family, ramp] of Object.entries(HOUSE_FAMILIES)) {
    for (const role of ROLES) {
      const d = distance(rgb, parseHex(ramp[role]));
      if (d < best.distance) best = { family, role, distance: d };
    }
  }
  return best;
}
