import type { AsciiArt } from "@hexhue/core";
import { Canvas, sprinkle } from "./draw";

// Sky is a playable color, so it must stand apart from the dark board panel.
const night = "#4b3c9e";
const moon = "#f6d97a";
const starlight = "#c9b8ff";

export const crescent: AsciiArt = {
  legend: { n: night, y: moon, s: starlight },
  rows: [
    "nnnnnnnnnnnn",
    "nnnyyyynnsnn",
    "nnyyyyynnnnn",
    "nyyyynnnnnnn",
    "nyyynnnnnnsn",
    "yyyynnnnnnnn",
    "yyyynnnnnnnn",
    "nyyynnnnnnnn",
    "nyyyynnnnsnn",
    "nnyyyyynnnnn",
    "nsnyyyynnnnn",
    "nnnnnnnnnnnn",
  ],
};

export const wishingStar: AsciiArt = {
  legend: { n: night, y: moon, w: "#fff6d8" },
  rows: [
    "nnnnnynnnnn",
    "nnnnyyynnnn",
    "nnnnyyynnnn",
    "yyyyywyyyyy",
    "nyyywwwyyyn",
    "nnyywwwyynn",
    "nnnyyyyynnn",
    "nnyyynyyynn",
    "nyyynnnyyyn",
    "nyynnnnnyyn",
    "nnnnnnnnnnn",
  ],
};

export const candleJar: AsciiArt = {
  legend: { f: "#ff9f43", y: moon, p: "#7a4fd0", w: "#f5efff" },
  rows: [
    "....ff....",
    "...fyyf...",
    "...fyyf...",
    "....ff....",
    "..pppppp..",
    "..pwwwwp..",
    "..pwwwwp..",
    "..pwwwwp..",
    "..pwwwwp..",
    "..pwwwwp..",
    "..pppppp..",
    ".pppppppp.",
  ],
};

export const lantern: AsciiArt = {
  legend: { h: starlight, g: "#7a4fd0", y: moon, o: "#ff9f43", w: "#fff6d8", f: "#ff5e7a" },
  rows: [
    ".....hh.....",
    "....h..h....",
    "...gggggg...",
    "..gyyyyyyg..",
    "..gyowwoyg..",
    "..gyowwoyg..",
    "..gyowwoyg..",
    "..gyoffoyg..",
    "..gyoffoyg..",
    "..gyyyyyyg..",
    "...gggggg...",
    "....g..g....",
    "...gggggg...",
  ],
};

export const moonPhases: AsciiArt = {
  legend: { n: night, d: "#355c7d", y: moon, s: starlight },
  rows: [
    "nnnnnnsnnnnnnnnnnns",
    "nnddynnndyysnnyyynn",
    "ndddyynddyyynyyyyyn",
    "ndddyynddyyynyyyyyn",
    "ndddyynddyyynyyyyyn",
    "nnddynnndyynnnyyynn",
    "snnnnnnnnnnnsnnnnnn",
  ],
};

// ── Levels 6–20, drawn with the canvas helper ───────────────────────────────

const silver = "#dfe6f0";
const violet = "#7a4fd0";
const ember = "#ff9f43";
const rose = "#ff5e7a";
const leaf = "#5fbf6a";
const lake = "#3fb8af";

export const starryNight = sprinkle(
  new Canvas(14, 12, "n").star(3.5, 3.5, 3.2, 1.3, 5, "y").star(10.5, 8.2, 2.8, 1.1, 5, "y"),
  "s",
  0.12,
  6,
  "n",
).art({ n: night, y: moon, s: starlight });

export const fullMoonRising = new Canvas(14, 14, "n")
  .disc(6.5, 5.5, 4.6, "y")
  .disc(5, 4, 0.9, "w")
  .disc(8.4, 6.6, 1.1, "w")
  .disc(5.6, 7.6, 0.6, "w")
  .poly(
    [
      [-1, 14],
      [-1, 10],
      [4, 8.5],
      [9, 10.5],
      [14, 9],
      [14, 14],
    ],
    "h",
  )
  .art({ n: night, y: moon, w: "#fff6d8", h: violet });

export const crescentAndStar = new Canvas(14, 14, "n")
  .disc(6, 6.5, 5.2, "y")
  .disc(8.4, 5.6, 4.4, "n")
  .star(9.8, 6.8, 3, 1.25, 5, "s")
  .art({ n: night, y: moon, s: starlight });

export const shootingStar = sprinkle(new Canvas(16, 12, "n"), "d", 0.06, 9, "n")
  .line(1, 10, 10, 3, "t")
  .line(2, 10, 10, 4, "t")
  .line(4, 9, 11, 3, "w")
  .star(12, 2.5, 2.3, 1, 5, "y")
  .art({ n: night, d: starlight, t: violet, w: "#fff6d8", y: moon });

export const eclipse = new Canvas(14, 14, "n")
  .disc(6.5, 6.5, 6, "o")
  .disc(6.5, 6.5, 5, "y")
  .disc(6.5, 6.5, 4.2, "e")
  .art({ n: night, o: ember, y: moon, e: "#355c7d" });

export const moonflower = (() => {
  const c = new Canvas(14, 14, "n");
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    c.ellipse(6.5 + Math.cos(a) * 2.6, 5 + Math.sin(a) * 2.6, 1.9, 1.9, "w");
  }
  return c
    .disc(6.5, 5, 1.4, "y")
    .rect(6, 8, 1, 6, "g")
    .ellipse(4.4, 11, 1.8, 0.9, "g")
    .ellipse(8.6, 10.2, 1.8, 0.9, "g")
    .art({ n: night, w: "#fff6d8", y: moon, g: leaf });
})();

export const witchsHat = new Canvas(14, 14, "n")
  .disc(10, 3.5, 2.6, "y")
  .poly(
    [
      [6.5, 0.5],
      [10, 10],
      [3, 10],
    ],
    "p",
  )
  .rect(3, 8, 8, 2, "b")
  .rect(6, 8, 2, 2, "y")
  .ellipse(6.5, 10.8, 6.2, 1.4, "p")
  .art({ n: night, y: moon, p: violet, b: rose });

export const bubblingCauldron = new Canvas(14, 14, "n")
  .disc(4.5, 2.5, 1.2, "g")
  .disc(8, 1.5, 0.9, "g")
  .disc(9.5, 4, 1, "g")
  .ellipse(6.5, 8.6, 5.4, 3.8, "k")
  .ellipse(6.5, 5.6, 5.2, 1, "g")
  .rect(2, 12, 2, 2, "k")
  .rect(9, 12, 2, 2, "k")
  .poly(
    [
      [4, 14],
      [6.5, 11],
      [9, 14],
    ],
    "o",
  )
  .art({ n: night, g: leaf, k: "#8a8aa3", o: ember });

/** The Triple Moon: waxing crescent, full moon, waning crescent. */
export const tripleMoon = new Canvas(26, 10, "n")
  .disc(4, 4.5, 4, "m")
  .disc(1.6, 4.5, 3.7, "n")
  .disc(21, 4.5, 4, "m")
  .disc(23.4, 4.5, 3.7, "n")
  .disc(12.5, 4.5, 3.7, "m")
  .disc(12.5, 4.5, 1.3, "s")
  .art({ n: night, m: silver, s: starlight });

export const moonlitLake = new Canvas(16, 14, "n")
  .disc(10.5, 3.5, 2.8, "y")
  .rect(0, 7, 16, 7, "l")
  .rect(8, 8, 5, 1, "y")
  .rect(9, 10, 3, 1, "y")
  .rect(10, 12, 1, 1, "y")
  .poly(
    [
      [0, 7],
      [0, 4.5],
      [3, 5.5],
      [5, 7],
    ],
    "p",
  )
  .art({ n: night, y: moon, l: lake, p: violet });

export const lunaMoth = new Canvas(16, 14, "n")
  .ellipse(4.5, 5, 3.6, 3.4, "w")
  .ellipse(5, 10, 2.4, 3, "w")
  .mirrorX()
  .disc(4.6, 5, 1.2, "y")
  .disc(11.4, 5, 1.2, "y")
  .rect(7, 2, 2, 11, "b")
  .line(7, 2, 5, 0, "b")
  .line(8, 2, 10, 0, "b")
  .art({ n: night, w: "#9be3a5", y: moon, b: rose });

export const lanternFestival = (() => {
  const lantern = [".s.", "ooo", "oyo", "oyo", "ooo", ".s."];
  const c = new Canvas(18, 11, "n").line(0, 1, 17, 1, "s");
  for (const [x, y] of [
    [2, 2],
    [7, 3],
    [13, 2],
  ] as const) {
    c.stamp(x, y, lantern);
  }
  return sprinkle(c, "y", 0.05, 17, "n").art({ n: night, s: starlight, o: rose, y: moon });
})();

export const batAcrossTheMoon = new Canvas(16, 14, "n")
  .disc(7.5, 6.5, 6, "y")
  .poly(
    [
      [1, 6],
      [4, 4.5],
      [6, 5.5],
      [7.5, 4],
      [9, 5.5],
      [11, 4.5],
      [14, 6],
      [12.5, 8],
      [11, 7],
      [9.5, 8.5],
      [7.5, 7],
      [5.5, 8.5],
      [4, 7],
      [2.5, 8],
    ],
    "b",
  )
  .art({ n: night, y: moon, b: violet });

export const moonGate = sprinkle(
  new Canvas(16, 16, "g").disc(7.5, 7.5, 6, "n").rect(0, 14, 16, 2, "p"),
  "s",
  0.1,
  19,
  "n",
)
  .disc(9.5, 5, 1.6, "y")
  .art({ g: "#9aa3b8", n: night, p: violet, s: starlight, y: moon });

export const bloodMoon = sprinkle(new Canvas(16, 16, "n"), "s", 0.08, 20, "n")
  .disc(7.5, 7.5, 6.4, "r")
  .disc(5.5, 5.5, 1.3, "c")
  .disc(9.8, 9.2, 1.6, "c")
  .disc(9.6, 4.8, 0.8, "c")
  .disc(5, 10, 0.7, "c")
  .art({ n: night, s: starlight, r: "#d7263d", c: ember });
