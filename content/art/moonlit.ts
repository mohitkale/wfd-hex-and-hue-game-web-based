import type { AsciiArt } from "@hexhue/core";

const night = "#2a1650";
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
