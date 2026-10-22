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
  return c.where(
    (x, y) => x > cx && y <= baseY && y >= baseY - height && c.get(x, y) === ch,
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
  const c = new Canvas(14, 14, "g");
  crystal(c, 3.5, 13, 4, 8, "a", "d");
  crystal(c, 10, 13, 4, 9, "a", "d");
  crystal(c, 6.5, 13, 5, 12, "q", "s");
  return c
    .rect(0, 12, 14, 2, "m")
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

export const selenite = (() => {
  const c = new Canvas(16, 10, "g");
  c.poly(
    [
      [1, 6],
      [12, 1],
      [14, 3],
      [3, 8.5],
    ],
    "q",
  );
  return sprinkle(c, "c", 0.05, 41, "g")
    .star(13.5, 2, 1.8, 0.7, 4, "c")
    .art({ g: garden, q: quartz, c: citrine });
})();

export const fairyRing = (() => {
  const c = new Canvas(16, 14, "m");
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const x = 7.5 + Math.cos(a) * 5.5;
    const y = 7 + Math.sin(a) * 4.5;
    c.ellipse(x, y - 0.4, 1.4, 0.9, "r").rect(Math.round(x), Math.round(y) + 1, 1, 1, "q");
  }
  return c.disc(7.5, 7, 1.4, "c").art({ m: moss, r: ruby, q: quartz, c: citrine });
})();

export const crystalLotus = (() => {
  const c = new Canvas(16, 12, "g");
  crystal(c, 7.5, 10, 3, 9, "r", "w");
  crystal(c, 4.5, 10, 3, 7, "r", "w");
  crystal(c, 10.5, 10, 3, 7, "r", "w");
  crystal(c, 2, 10, 2.4, 5, "a", "a");
  crystal(c, 13, 10, 2.4, 5, "a", "a");
  return c.rect(0, 10, 16, 2, "e").art({ g: garden, r: rose, w: quartz, a: amethyst, e: emerald });
})();

export const obsidianMirror = new Canvas(12, 15, "g")
  .ellipse(5.5, 6, 5, 5.6, "c")
  .ellipse(5.5, 6, 3.8, 4.4, "k")
  .ellipse(4, 4.4, 1, 1.6, "s")
  .rect(5, 11, 2, 4, "c")
  .art({ g: garden, c: citrine, k: "#3c3a55", s: stone });

export const chakraStones = (() => {
  const colors = ["r", "o", "c", "e", "b", "i", "a"];
  const c = new Canvas(10, 22, "g");
  colors.forEach((ch, k) => c.ellipse(4.5, 19.5 - k * 3, 2.6, 1.3, ch));
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
  crystal(c, 4, 13, 3, 6, "a", "d");
  crystal(c, 9, 13, 4, 8, "b", "q");
  crystal(c, 14, 13, 3, 5, "e", "e");
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

export const pendulum = new Canvas(12, 16, "g")
  .line(5.5, 0, 5.5, 7, "c")
  .rect(4, 0, 4, 1, "c")
  .poly(
    [
      [3, 8],
      [8, 8],
      [5.5, 14.5],
    ],
    "a",
  )
  .rect(3, 7, 5, 2, "q")
  .art({ g: garden, c: citrine, a: amethyst, q: quartz });

export const heartOfTheGarden = (() => {
  const c = new Canvas(18, 16, "m");
  sprinkle(c, "e", 0.12, 51, "m");
  c.poly(
    [
      [3, 6],
      [6, 2],
      [12, 2],
      [15, 6],
      [9, 14],
    ],
    "r",
  )
    .poly(
      [
        [3, 6],
        [15, 6],
        [9, 14],
      ],
      "a",
    )
    .poly(
      [
        [6, 2],
        [9, 6],
        [12, 2],
      ],
      "w",
    );
  return c.art({ m: moss, e: emerald, r: rose, a: amethyst, w: quartz });
})();
