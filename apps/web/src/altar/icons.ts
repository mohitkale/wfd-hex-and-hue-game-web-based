import type { Icon } from "@hexhue/learn";

/**
 * The altar's tools as small hand-drawn pixel icons, 12 x 12, drawn as SVG squares so they stay
 * crisp at any size. Letters pick colours; `w` is the candle's wax colour, `.` is empty.
 */
const INK: Record<string, string> = {
  k: "#1d1233", // outline
  y: "#ffd84a", // flame
  o: "#ff9a3c", // flame core
  s: "#c9ccd6", // silver
  d: "#8b8fa3", // silver shade
  g: "#3fa45b", // leaf
  e: "#2a7a43", // leaf shade
  b: "#6e4a2f", // wood
  n: "#9c6b45", // wood light
  f: "#f4f1ea", // feather / salt
  m: "#c8bfae", // feather shade
  r: "#7d7f8c", // stone
  t: "#a4a6b4", // stone light
  a: "#5aa0e8", // water
  c: "#c9a227", // brass
  h: "#e8c95a", // brass light
};

const ART: Record<Icon, readonly string[]> = {
  feather: [
    "..........kk",
    "........kkfk",
    ".......kffmk",
    "......kffmk.",
    ".....kffmk..",
    "....kffmk...",
    "...kffmk....",
    "...kfmk.....",
    "..kfmk......",
    "..kmk.......",
    ".kk.........",
    "k...........",
  ],
  candle: [
    ".....k......",
    "....kyk.....",
    "....kok.....",
    ".....k......",
    "....kwwk....",
    "....kwwk....",
    "....kwwk....",
    "....kwwk....",
    "....kwwk....",
    "...kkkkkk...",
    "..kccccccck.",
    "..kkkkkkkkk.",
  ],
  chalice: [
    "..kkkkkkkk..",
    "..kaaaaaak..",
    "..ksaaaask..",
    "..kssssssk..",
    "...kssssk...",
    "....kssk....",
    ".....kk.....",
    ".....sk.....",
    ".....sk.....",
    "....kssk....",
    "...kssssk...",
    "...kkkkkk...",
  ],
  stone: [
    "............",
    "............",
    "....kkkk....",
    "..kkttttkk..",
    ".kttttrrrrk.",
    ".kttrrrrrrk.",
    "kttrrrrrrrrk",
    "krrrrrrrrrrk",
    "krrrrrrrrrk.",
    ".kkrrrrrrkk.",
    "...kkkkkk...",
    "............",
  ],
  bell: [
    ".....kk.....",
    "....kchk....",
    "....kkkk....",
    "...kchhhk...",
    "...kchhhk...",
    "..kcchhhhk..",
    "..kcchhhhk..",
    ".kccchhhhhk.",
    "kkkkkkkkkkkk",
    "kcccccccccck",
    "kkkkk.kkkkk.",
    ".....kk.....",
  ],
  wand: [
    "..........yk",
    ".........kyk",
    "........knk.",
    ".......knk..",
    "......knk...",
    ".....knk....",
    "....kbk.....",
    "...kbk......",
    "..kbk.......",
    ".kbk........",
    "kbk.........",
    "kk..........",
  ],
  bowl: [
    "............",
    "............",
    "............",
    "............",
    "kkkkkkkkkkkk",
    "knnnnnnnnnnk",
    "kbnnnnnnnnbk",
    ".kbnnnnnnbk.",
    "..kbbbbbbk..",
    "...kkkkkk...",
    "............",
    "............",
  ],
  plate: [
    "............",
    "............",
    "............",
    "............",
    "............",
    "..kkkkkkkk..",
    ".kssssssssk.",
    "kssddddddssk",
    ".kssssssssk.",
    "..kkkkkkkk..",
    "............",
    "............",
  ],
  oil: [
    ".....kk.....",
    ".....bk.....",
    "....kkkk....",
    "....kssk....",
    "...kkkkkk...",
    "..khhhhhhk..",
    "..khcccchk..",
    "..khcccchk..",
    "..khcccchk..",
    "..khhhhhhk..",
    "...kkkkkk...",
    "............",
  ],
  sprig: [
    "......k.....",
    ".....kgk....",
    "...k.kek.k..",
    "..kgkkekkgk.",
    "...kekgkek..",
    ".k..kkekk.k.",
    "kgkkkgekkkgk",
    ".kekkkekkek.",
    "..kkkgekkk..",
    "....kbk.....",
    "....kbk.....",
    ".....k......",
  ],
  snuffer: [
    "...kkkk.....",
    "..kssssk....",
    "..kssssk....",
    "..kddddk....",
    "...kkkkk....",
    ".....kdk....",
    "......kdk...",
    ".......kdk..",
    "........kdk.",
    ".........kbk",
    "..........kk",
    "............",
  ],
  salt: [
    "............",
    "............",
    "....kkkk....",
    "...kffffk...",
    "..kffmfffk..",
    "kkkkkkkkkkkk",
    "knnnnnnnnnnk",
    "kbnnnnnnnnbk",
    ".kbnnnnnnbk.",
    "..kbbbbbbk..",
    "...kkkkkk...",
    "............",
  ],
};

/** The icon as an SVG string, `size` CSS pixels square. A lit candle shows its flame. */
export function iconSvg(
  icon: Icon,
  size: number,
  wax = "#f4f1ea",
  lit = icon !== "candle",
): string {
  const rows = ART[icon];
  const rects: string[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      // An unlit candle hides its flame (the top three rows above the wick).
      if (icon === "candle" && !lit && y < 3 && (ch === "y" || ch === "o" || ch === "k")) return;
      const fill = ch === "w" ? wax : INK[ch];
      if (fill) rects.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${fill}"/>`);
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${rects.join("")}</svg>`;
}

export const ICON_ART = ART;
