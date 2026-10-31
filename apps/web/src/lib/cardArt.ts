/**
 * The picture on a card: a faceted stone for crystals, a leaf for herbs, hand-drawn on a 10 x 10
 * pixel grid and tinted with the card's colour (`c` the colour, `l` a lighter tone, `d` darker).
 */
const GEM = [
  "...kkkk...",
  "..kllcck..",
  ".kllccdck.",
  "kllccccdck",
  "klcccccdck",
  "kcccccddck",
  ".kccccddk.",
  "..kcccdk..",
  "...kcdk...",
  "....kk....",
];
const LEAF = [
  "......kkk.",
  "....kklcck",
  "...klcccck",
  "..klccckck",
  ".klcckccdk",
  ".kccckcdk.",
  "kcckccdk..",
  "kckcddk...",
  "kkkkkk....",
  "k.........",
];

function shade(hex: string, by: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + by * 255)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function cardSvg(kind: "crystals" | "herbs", color: string, size = 64): string {
  const art = kind === "herbs" ? LEAF : GEM;
  const ink: Record<string, string> = {
    k: "#1d1233",
    c: color,
    l: shade(color, 0.22),
    d: shade(color, -0.22),
  };
  const rects: string[] = [];
  art.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const fill = ink[ch];
      if (fill) rects.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${fill}"/>`);
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${rects.join("")}</svg>`;
}

export { GEM, LEAF, shade };
