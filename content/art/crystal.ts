import { Canvas, sprinkle } from "./draw";

// Crystal Garden palette. Every artwork uses a subset; CI checks contrast and separation.
const garden = "#2d6a6a"; // deep teal soil/sky
const moss = "#8bc34a";
const amethyst = "#9b5de5";
const amethystDark = "#6a3fb5";
const rose = "#f7a8c8";
const citrine = "#f6c445";
const quartz = "#e8f1ff";
const sapphire = "#3a86ff";
const emerald = "#2ecc71";
const stone = "#9aa3b8";
const ember = "#ff6b35";
const ruby = "#e63946";

/**
 * A crystal point: a column with a pointed top. The right half is painted `shade` so the facets
 * read as 3D.
 */
function crystal(
  c: Canvas,
  cx: number,
  baseY: number,
  width: number,
  height: number,
  ch: string,
  shade: string,
): Canvas {
  const half = width / 2;
  const shoulder = baseY - height + half;
  c.poly(
    [
      [cx - half, baseY],
      [cx - half, shoulder],
      [cx, baseY - height],
      [cx + half, shoulder],
      [cx + half, baseY],
    ],
    ch,
  );
  // Shade only this crystal's own right half, never same-colored neighbours.
  return c.where(
    (x, y) => x > cx && x <= cx + half && y <= baseY && y >= baseY - height && c.get(x, y) === ch,
    shade,
  );
}

export const amethystPoint = crystal(new Canvas(10, 14, "g"), 4.5, 13, 6, 13, "a", "d").art({
  g: garden,
  a: amethyst,
  d: amethystDark,
});

export const roseQuartzHeart = new Canvas(13, 12, "g")
  .disc(3.6, 3.6, 3.1, "r")
  .disc(8.4, 3.6, 3.1, "r")
  .poly(
    [
      [0.6, 4.2],
      [11.4, 4.2],
      [6, 11],
    ],
    "r",
  )
  .disc(3.4, 3, 1, "w")
  .art({ g: garden, r: rose, w: quartz });

export const citrineSun = new Canvas(14, 14, "g")
  .star(6.5, 6.5, 6.4, 3.6, 8, "o")
  .disc(6.5, 6.5, 3.6, "c")
  .art({ g: garden, o: ember, c: citrine });

export const crystalCluster = (() => {
  const c = new Canvas(15, 14, "g");
  crystal(c, 7, 12, 5, 12, "q", "s");
  crystal(c, 3.5, 12, 4, 8, "a", "d");
  crystal(c, 10.5, 12, 4, 8, "a", "d");
  return c
    .rect(0, 12, 15, 2, "m")
    .art({ g: garden, a: amethyst, d: amethystDark, q: quartz, s: stone, m: moss });
})();

export const quartzTower = crystal(new Canvas(10, 16, "g"), 4.5, 14, 6, 14, "q", "s")
  .rect(1, 14, 8, 2, "m")
  .art({ g: garden, q: quartz, s: stone, m: moss });

export const geode = new Canvas(14, 14, "g")
  .ellipse(6.5, 6.5, 6.4, 5.8, "s")
  .ellipse(6.5, 6.5, 5, 4.4, "q")
  .ellipse(6.5, 6.5, 4, 3.4, "a")
  .ellipse(6.5, 6.5, 2.2, 1.8, "d")
  .art({ g: garden, s: stone, q: quartz, a: amethyst, d: amethystDark });

export const emeraldLeaf = new Canvas(14, 14, "g")
  .poly(
    [
      [2, 12],
      [3, 6],
      [7, 2],
      [12, 1],
      [11, 7],
      [7, 11],
    ],
    "e",
  )
  .line(2, 12, 10, 3, "m")
  .art({ g: garden, e: emerald, m: moss });

export const sapphireDrop = new Canvas(12, 14, "g")
  .disc(5.5, 9, 4.2, "b")
  .poly(
    [
      [1.6, 8.4],
      [5.5, 0.5],
      [9.4, 8.4],
    ],
    "b",
  )
  .ellipse(4, 9, 1, 1.6, "q")
  .art({ g: garden, b: sapphire, q: quartz });

export const crystalGrid = (() => {
  const c = new Canvas(15, 15, "g");
  const stones = ["r", "c", "e", "b", "a", "o"];
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 3;
    c.disc(7 + Math.cos(a) * 5, 7 + Math.sin(a) * 5, 1.6, stones[k]!);
    c.line(7, 7, 7 + Math.cos(a) * 3.4, 7 + Math.sin(a) * 3.4, "q");
  }
  return c.disc(7, 7, 1.8, "q").art({
    g: garden,
    q: quartz,
    r: rose,
    c: citrine,
    e: emerald,
    b: sapphire,
    a: amethyst,
    o: ember,
  });
})();

export const moonstone = new Canvas(14, 12, "g")
  .ellipse(6.5, 5.5, 6, 4.6, "s")
  .ellipse(6.5, 5.5, 5, 3.7, "q")
  .ellipse(5, 4.2, 2.2, 1.2, "b")
  .art({ g: garden, s: stone, q: quartz, b: sapphire });

export const gardenPath = sprinkle(new Canvas(14, 14, "m"), "e", 0.15, 31, "m")
  .ellipse(4, 12, 2, 1.2, "s")
  .ellipse(8, 9.5, 2, 1.2, "s")
  .ellipse(5, 6.5, 2, 1.2, "s")
  .ellipse(9, 3.5, 2, 1.2, "s")
  .ellipse(6, 1, 2, 1, "s")
  .art({ m: moss, e: emerald, s: stone });

export const crystalBall = new Canvas(14, 15, "g")
  .disc(6.5, 6, 5.5, "b")
  .disc(4.6, 4, 1.4, "q")
  .disc(8, 7.6, 0.8, "a")
  .rect(3, 11, 8, 1, "c")
  .rect(2, 12, 10, 2, "c")
  .rect(1, 14, 12, 1, "c")
  .art({ g: garden, b: sapphire, q: quartz, a: amethyst, c: citrine });

export const selenite = new Canvas(16, 10, "g")
  .poly(
    [
      [1, 6],
      [12, 1],
      [14, 3],
      [3, 8.5],
    ],
    "q",
  )
  .stamp(11, 0, ["..c..", ".ccc.", "ccccc", ".ccc.", "..c.."])
  .stamp(2, 1, [".c.", "ccc", ".c."])
  .stamp(12, 6, [".c.", "ccc", ".c."])
  .art({ g: garden, q: quartz, c: citrine });

/** Eight mushrooms placed symmetrically around x = 7, each a 3-wide cap over a stem. */
export const fairyRing = (() => {
  const mushroom = ["rrr", ".q."];
  const c = new Canvas(15, 14, "m");
  for (const [x, y] of [
    [6, 1],
    [10, 2],
    [12, 6],
    [10, 10],
    [6, 11],
    [2, 10],
    [0, 6],
    [2, 2],
  ] as const) {
    c.stamp(x, y, mushroom);
  }
  return c.disc(7, 6.5, 1.4, "c").art({ m: moss, r: ruby, q: quartz, c: citrine });
})();

export const crystalLotus = (() => {
  const c = new Canvas(17, 12, "g");
  crystal(c, 2.5, 10, 3, 4, "a", "d");
  crystal(c, 13.5, 10, 3, 4, "a", "d");
  crystal(c, 5, 10, 3, 6, "r", "w");
  crystal(c, 11, 10, 3, 6, "r", "w");
  crystal(c, 8, 10, 4, 9, "r", "w");
  return c.rect(0, 10, 17, 2, "e").art({
    g: garden,
    r: rose,
    w: quartz,
    a: amethyst,
    d: amethystDark,
    e: emerald,
  });
})();

export const obsidianMirror = new Canvas(12, 15, "g")
  .ellipse(5.5, 6, 5, 5.6, "c")
  .ellipse(5.5, 6, 3.8, 4.4, "k")
  .ellipse(4, 4.4, 1, 1.6, "s")
  .rect(5, 11, 2, 4, "c")
  .art({ g: garden, c: citrine, k: "#3c3a55", s: stone });

export const chakraStones = (() => {
  // Root (red) at the bottom to crown (violet) at the top.
  const colors = ["r", "o", "c", "e", "b", "i", "a"];
  const c = new Canvas(9, 22, "g");
  colors.forEach((ch, k) => c.stamp(2, 18 - k * 3, [".xxx.", "xxxxx", ".xxx."]).swap("x", ch));
  return c.art({
    g: garden,
    r: ruby,
    o: ember,
    c: citrine,
    e: emerald,
    b: sapphire,
    i: "#5e60ce",
    a: "#c77dff",
  });
})();

export const crystalCave = (() => {
  const c = new Canvas(18, 14, "k").rect(0, 0, 18, 2, "s");
  for (const [x, h] of [
    [2, 6],
    [6, 4],
    [10, 7],
    [14, 5],
  ] as const) {
    c.poly(
      [
        [x - 1.6, 1],
        [x + 1.6, 1],
        [x, 1 + h],
      ],
      "s",
    );
  }
  crystal(c, 3.5, 13, 3, 6, "a", "d");
  crystal(c, 8.5, 13, 4, 8, "b", "q");
  crystal(c, 13.5, 13, 3, 5, "e", "e");
  return c.rect(0, 13, 18, 1, "s").art({
    k: garden,
    s: stone,
    a: amethyst,
    d: amethystDark,
    b: sapphire,
    q: quartz,
    e: emerald,
  });
})();

export const pendulum = new Canvas(11, 16, "g")
  .rect(3, 0, 5, 1, "c")
  .line(5, 1, 5, 6, "c")
  .rect(3, 7, 5, 2, "q")
  .poly(
    [
      [3, 9],
      [7, 9],
      [5, 14],
    ],
    "a",
  )
  .art({ g: garden, c: citrine, a: amethyst, q: quartz });

/** The finale: a heart banded in every color gathered in the garden, with a quartz glint. */
export const heartOfTheGarden = (() => {
  const c = new Canvas(17, 16, "m")
    .disc(5, 5, 3.8, "h")
    .disc(11, 5, 3.8, "h")
    .poly(
      [
        [1.2, 6],
        [14.8, 6],
        [8, 14.5],
      ],
      "h",
    );
  const bands = ["r", "c", "e", "b", "a"];
  for (let y = 0; y < 16; y++) {
    const band = bands[Math.min(bands.length - 1, Math.max(0, Math.floor((y - 1) / 3)))]!;
    c.where((x, yy) => yy === y && c.get(x, yy) === "h", band);
  }
  return c.stamp(3, 3, ["ww", "w."]).art({
    m: moss,
    r: rose,
    c: citrine,
    e: emerald,
    b: sapphire,
    a: amethyst,
    w: quartz,
  });
})();
