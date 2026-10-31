/**
 * The Yule picture for the Wheel of the Year page: a hand-drawn pixel Yule log with three candles
 * and a sprig of evergreen, in the Yule palette (deep green, gold, berry red, snow). 20 x 14 cells.
 */
const INK: Record<string, string> = {
  k: "#1d1233",
  b: "#6e4a2f",
  n: "#9c6b45",
  r: "#c9a07a",
  g: "#2f7a4a",
  e: "#1f5a35",
  y: "#ffd84a",
  o: "#ff9a3c",
  w: "#f4f1ea",
  c: "#c23b3b",
  h: "#c9a227",
};

const ART = [
  "....y......y......y.",
  "...yoy....yoy....yoy",
  "....k......k......k.",
  "...kwk....kck....kwk",
  "...kwk....kck....kwk",
  "...kwk....kck....kwk",
  "..kkkkkkkkkkkkkkkkkk",
  ".kbnnnnbnnnnnbnnnnbk",
  "kbrnbnnnnbnnnnnbnnbk",
  "krrbnnbnnnnbnnnnbnbk",
  "kbrnnnnbnnnnnbnnnnbk",
  ".kkkkkkkkkkkkkkkkkk.",
  "geg.c.ege.gcg.ege.ge",
  ".e.ege.g.ege.g.c.eg.",
];

export function yuleSvg(cell = 8): string {
  const rects: string[] = [];
  ART.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const fill = INK[ch];
      if (fill) rects.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${fill}"/>`);
    }),
  );
  const w = ART[0]!.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${ART.length}" width="${w * cell}" height="${ART.length * cell}" shape-rendering="crispEdges" role="img" aria-label="A Yule log with three lit candles and evergreen">${rects.join("")}</svg>`;
}

export const YULE_ART = ART;
