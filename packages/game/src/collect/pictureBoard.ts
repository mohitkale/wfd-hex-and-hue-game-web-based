import * as collect from "@hexhue/core/collect";
import { hexToNumber } from "../theme";

/**
 * Picture boards (M15.13, owner direction after the reference game): every puzzle uses one small,
 * fixed set of clearly different, vivid colours, a cube's colour **is** its box's colour (no shades
 * within a colour), and the whole board is filled with cubes: the picture in its key colours with a
 * black outline round it, and a simple scene behind it (sky above, ground below). The art pieces are mapped onto this palette; their boxes are generated
 * again to match. Pure and deterministic; the production gate verifies every board it makes.
 */

/**
 * The only colours a board uses, each easy to tell from the others on the light board: every pair is
 * at least `MIN_PALETTE_DELTA_E` apart (M15.13 owner feedback: some neighbouring colours were too
 * alike; navy, the purples and the greys were spread apart).
 */
export const PICTURE_PALETTE = {
  red: "#f23b3b",
  pink: "#ff7eb9",
  orange: "#ff8a1f",
  tan: "#f0c088",
  brown: "#9a5530",
  yellow: "#ffd426",
  /** Dark gold: the shaded side of yellow things (a moon's shadow, a brass scale), owner feedback. */
  ochre: "#c9962c",
  lightGreen: "#7fd94a",
  darkGreen: "#1f9e4a",
  skyBlue: "#4cc9f5",
  blue: "#2a6cf0",
  navy: "#1a3088",
  lightPurple: "#dab6ff",
  purple: "#a957ee",
  darkPurple: "#6e1c94",
  white: "#fbfbfb",
  lightGrey: "#a9adbf",
  grey: "#636678",
  black: "#26262e",
} as const;

const COLOURS: readonly string[] = Object.values(PICTURE_PALETTE);

/** Shades of one colour: a picture's outline is not drawn between them, so they read as shading. */
export const FAMILIES: readonly (readonly string[])[] = (() => {
  const P = PICTURE_PALETTE;
  return [
    [P.red, P.pink],
    [P.orange, P.yellow, P.ochre],
    [P.tan, P.brown],
    [P.lightGreen, P.darkGreen],
    [P.skyBlue, P.blue, P.navy],
    [P.lightPurple, P.purple, P.darkPurple],
    [P.white, P.lightGrey, P.grey],
  ];
})();

/** Sky colours, in order of preference: the first the picture does not use fills the sky. */
const SKIES: readonly string[] = [
  PICTURE_PALETTE.skyBlue,
  PICTURE_PALETTE.blue,
  PICTURE_PALETTE.white,
  PICTURE_PALETTE.lightGrey,
];

/** Ground colours, in order of preference (grass, sand, soil). */
const GROUNDS: readonly string[] = [
  PICTURE_PALETTE.lightGreen,
  PICTURE_PALETTE.tan,
  PICTURE_PALETTE.yellow,
  PICTURE_PALETTE.darkGreen,
];

/** The share of the board's rows, from the bottom, that is ground behind the picture. */
const GROUND_ROWS = 0.22;

/** The outline drawn round the picture so its shape reads at a glance. */
const OUTLINE = PICTURE_PALETTE.black;
/** Art colours that already make a dark edge, so no outline is added next to them. */
const DARK_EDGES: ReadonlySet<string> = new Set([
  PICTURE_PALETTE.black,
  PICTURE_PALETTE.navy,
  PICTURE_PALETTE.darkPurple,
]);
/** The scene is filled in only when the picture covers at least this share of its own canvas. */
const FILL_FROM = 0.7;

/**
 * The largest box, like the reference's (up to about 84): fewer, larger boxes keep the solver's
 * proof of every board within its budget now that colours have light, mid and dark versions.
 */
const BOX_MAX = 80;

/** The art library's pictures stay at most this size when densified and framed (their old board limit). */
const PICTURE_MAX = 40;

/** Every two palette colours differ at least this much (CIE76 ΔE). */
export const MIN_PALETTE_DELTA_E = 27;
/** Two colours that touch in a picture must differ at least this much (ΔE), else they blur together. */
export const MIN_NEIGHBOUR_DELTA_E = 27;

/** CIELAB of a colour (D65). */
function lab(hex: string): [number, number, number] {
  const lin = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const [r, g, b] = lin;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** How different two colours look (CIE76 ΔE: about 2 is just visible, 25+ is clearly different). */
export function deltaE(a: string, b: string): number {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * Pairs of colours that touch somewhere in `level` (side by side) but look too alike, as
 * `"#aaaaaa/#bbbbbb"`: a picture must keep every neighbouring region clearly apart.
 */
export function contrastIssues(level: collect.CollectLevel): string[] {
  const out = new Set<string>();
  const { width, height, cells, palette } = level;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const a = cells[y * width + x]!;
      if (a < 0) continue;
      for (const [nx, ny] of [
        [x + 1, y],
        [x, y + 1],
      ] as const) {
        if (nx >= width || ny >= height) continue;
        const b = cells[ny * width + nx]!;
        if (b < 0 || b === a) continue;
        const [p, q] = [palette[a]!, palette[b]!].sort() as [string, string];
        if (deltaE(p, q) < MIN_NEIGHBOUR_DELTA_E) out.add(`${p}/${q}`);
      }
    }
  return [...out];
}

function rgb(hex: string): [number, number, number] {
  const n = hexToNumber(hex);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hue (0..360), saturation and lightness (0..1) of a colour. */
function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return { h, s, l };
}

/**
 * The palette colour a person would call `hex`: dull colours are black, grey or white by lightness
 * (so a dark slate cat is black, not purple); others go by hue (light and dark green apart, light blue
 * is sky blue, dark orange is brown).
 */
export function nearestColour(hex: string): string {
  const P = PICTURE_PALETTE;
  const { h, s, l } = hsl(hex);
  // Each family keeps a light, a mid and (for most) a dark colour, so the picture keeps its shading.
  if (l < 0.16) return P.black;
  if (s < 0.28 || l > 0.93)
    return l < 0.32 ? P.black : l < 0.55 ? P.grey : l < 0.85 ? P.lightGrey : P.white;
  if (h < 15 || h >= 335) return l > 0.68 ? P.pink : P.red;
  if (h < 38) return l < 0.42 ? P.brown : l > 0.7 ? P.tan : P.orange;
  if (h < 70) return l < 0.35 ? P.brown : l < 0.56 ? P.ochre : P.yellow;
  if (h < 165) return l < 0.42 ? P.darkGreen : P.lightGreen;
  if (h < 205) return P.skyBlue;
  if (h < 250) return l > 0.62 ? P.skyBlue : l < 0.36 ? P.navy : P.blue;
  if (h < 300) return l > 0.66 ? P.lightPurple : l < 0.4 ? P.darkPurple : P.purple;
  return l > 0.55 ? P.pink : P.purple;
}

/**
 * How deep each cell sits from the edge of the board (0 on the outer ring of cells), so boxes can be
 * ordered roughly the way the board peels from the outside in.
 */
function depths(width: number, height: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) out.push(Math.min(x, y, width - 1 - x, height - 1 - y));
  return out;
}

/**
 * The board for `level` as a picture board: every cell a cube, each cube one of `PICTURE_PALETTE`
 * (the art's colour, or the background where the art has none), and new boxes that match: each colour
 * split into boxes of at most `BOX_MAX`, ordered outside first. The picture and its name are kept.
 */
/**
 * A small picture drawn with more, smaller cubes (each art pixel becomes a 2×2 block) while it still
 * fits the board limit, so every board is about as dense as the reference's (30 to 40 cubes across).
 */
export function densify(level: collect.CollectLevel): collect.CollectLevel {
  if (level.width * 2 > PICTURE_MAX || level.height * 2 > PICTURE_MAX || level.width >= 24)
    return level;
  const w = level.width * 2;
  const h = level.height * 2;
  const up = (cells: readonly number[]) =>
    Array.from({ length: w * h }, (_, i) => {
      const x = Math.floor((i % w) / 2);
      const y = Math.floor(Math.floor(i / w) / 2);
      return cells[y * level.width + x]!;
    });
  const out: collect.CollectLevel = {
    ...level,
    width: w,
    height: h,
    cells: up(level.cells),
    // Each box covers four times the cubes; boxes are generated again by `toPictureBoard` anyway.
    columns: level.columns.map((c) => c.map((g) => ({ ...g, capacity: g.capacity * 4 }))),
  };
  if (level.shades) out.shades = { ...level.shades, cells: up(level.shades.cells) };
  delete out.portalX;
  return out;
}

/**
 * The picture centred on a larger board (up to the 40-cube limit each way), with a margin round it
 * that the scene fills, so the board has about twice the cubes and the picture sits in the middle.
 */
export function frame(level: collect.CollectLevel): collect.CollectLevel {
  const pad = (n: number) => Math.min(PICTURE_MAX, n + 2 * Math.max(3, Math.round(n * 0.18)));
  const w = pad(level.width);
  const h = pad(level.height);
  if (w === level.width && h === level.height) return level;
  const ox = Math.floor((w - level.width) / 2);
  const oy = Math.floor((h - level.height) / 2);
  const place = (cells: readonly number[]) =>
    Array.from({ length: w * h }, (_, i) => {
      const x = (i % w) - ox;
      const y = Math.floor(i / w) - oy;
      return x < 0 || y < 0 || x >= level.width || y >= level.height
        ? -1
        : cells[y * level.width + x]!;
    });
  const out: collect.CollectLevel = { ...level, width: w, height: h, cells: place(level.cells) };
  if (level.shades) out.shades = { ...level.shades, cells: place(level.shades.cells) };
  delete out.portalX;
  return out;
}

/**
 * `seal` (Hard and Extreme levels, M15.13): an outline ring round the whole picture, margin included,
 * without sky or ground, so the picture's inner colours open up only as its outside is cleared.
 */
export function toPictureBoard(
  source: collect.CollectLevel,
  opts: { seal?: boolean; margin?: boolean; scene?: boolean } = {},
): collect.CollectLevel {
  const dense = densify(source);
  // A journey picture is drawn at its board size, edge to edge: no margin round it (`margin: false`).
  const level = opts.margin === false ? dense : frame(dense);
  const { width, height } = level;
  // The art's colour per cell: its shade when it has one, else its family colour.
  const artHex = level.cells.map((c, i) => {
    if (c < 0) return null;
    const shade = level.shades?.cells[i];
    return shade !== undefined && shade >= 0 ? level.shades!.colors[shade]! : level.palette[c]!;
  });
  const mapped = artHex.map((h) => (h === null ? null : nearestColour(h)));
  // The scene (sky above, ground below, a black outline round the picture) fills the gaps of a picture
  // that already covers most of its canvas (a busy picture with many patches): otherwise the empty
  // cells stay empty, as filler cubes only make the level longer (owner feedback).
  // Measured on the picture's own canvas, before the margin round it.
  const artCells = mapped.filter((h) => h !== null).length;
  // A journey picture is played exactly as drawn (`scene: false`): it is never given a scene.
  const filled = opts.scene !== false && artCells >= FILL_FROM * dense.width * dense.height;
  const used = new Set(mapped.filter((h): h is string => h !== null));
  used.add(OUTLINE);
  const sky = SKIES.find((b) => !used.has(b)) ?? PICTURE_PALETTE.skyBlue;
  const ground = GROUNDS.find((b) => !used.has(b) && b !== sky) ?? sky;
  // The outline goes only where the picture's own edge is light: a picture that already has a dark
  // edge is not given a second, thicker one.
  const lightAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const h = mapped[y * width + x];
    return h !== null && h !== undefined && !DARK_EDGES.has(h);
  };
  // Only gaps inside the picture's own canvas are filled, never the margin round it (filler cubes).
  const ox = Math.floor((width - dense.width) / 2);
  const oy = Math.floor((height - dense.height) / 2);
  const horizon = oy + Math.round(dense.height * (1 - GROUND_ROWS));
  const hexes = mapped.map((h, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    const inCanvas = x >= ox && y >= oy && x < ox + dense.width && y < oy + dense.height;
    if (h !== null) return h;
    if (opts.seal || (filled && inCanvas))
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && lightAt(x + dx, y + dy)) return OUTLINE;
    if (!filled || !inCanvas) return null;
    return y >= horizon ? ground : sky;
  });
  // The palette in a fixed order (the one above), only the colours this board uses.
  const palette = COLOURS.filter((c) => hexes.includes(c));
  const cells = hexes.map((h) => (h === null ? -1 : palette.indexOf(h)));

  // Boxes: per colour, split evenly into boxes of at most BOX_MAX, each placed at the depth of its
  // share of that colour's cubes (outermost cubes first), then all boxes in order of depth.
  const depth = depths(width, height);
  const boxes: { color: number; capacity: number; at: number }[] = [];
  palette.forEach((_, color) => {
    const ds = cells
      .map((c, i) => (c === color ? depth[i]! : -1))
      .filter((d) => d >= 0)
      .sort((a, b) => a - b);
    const n = Math.ceil(ds.length / BOX_MAX);
    let from = 0;
    for (let k = 0; k < n; k++) {
      const size = Math.floor(ds.length / n) + (k < ds.length % n ? 1 : 0);
      boxes.push({ color, capacity: size, at: ds[from + Math.floor(size / 2)]! + k * 0.01 });
      from += size;
    }
  });
  boxes.sort((a, b) => a.at - b.at || a.color - b.color);
  const columnCount = Math.max(1, level.columns.length);
  const columns: collect.GroupSpec[][] = Array.from({ length: columnCount }, () => []);
  boxes.forEach((b, i) => columns[i % columnCount]!.push({ color: b.color, capacity: b.capacity }));

  // The finished picture (reveal, Spellbook) is drawn from `shades`: one shade per colour, so it shows
  // exactly the colours played.
  const shades = {
    colors: palette.slice(),
    family: palette.map((_, i) => i),
    cells: cells.slice(),
  };
  const out: collect.CollectLevel = { ...level, palette, cells, columns, shades };
  delete out.seals;
  delete out.portalX;
  return out;
}
