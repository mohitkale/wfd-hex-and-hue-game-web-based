import { FAMILIES, PICTURE_PALETTE as P } from "./pictureBoard";
import { Canvas } from "./pixelCanvas";

/**
 * The journey's pictures, chapters 4 to 6 (M15.13): Moon & Stars, Familiars & Spirits, The Grimoire.
 * Same bordered style as `journeyArtA.ts`.
 */

const line = (g: Canvas) => g.outline(P.black, { families: FAMILIES });

/** A crescent: the disc of the moon with a second, offset disc taken out of it. */
function crescent(g: Canvas, cx: number, cy: number, r: number, dx: number, dy: number): void {
  g.disc(cx, cy, r, P.yellow);
  g.disc(cx + dx, cy + dy, r * 0.88, null);
  // The inner edge in shade.
  g.recolour(
    P.ochre,
    (x, y, was) =>
      was === P.yellow && Math.hypot(x + 0.5 - cx - dx, y + 0.5 - cy - dy) < r * 0.88 + 1.2,
  );
}

// ---------------------------------------------------------------------------------------------
// Chapter 4: Moon & Stars
// ---------------------------------------------------------------------------------------------

export function crescentMoon(): Canvas {
  const g = new Canvas(24, 24);
  crescent(g, 11, 12, 9.5, 4.5, -3);
  line(g);
  g.star5(18.5, 15.5, 3, P.yellow);
  g.star(20, 4, P.yellow);
  g.star(4, 21, P.white, 0);
  g.star(21, 21, P.yellow, 0);
  return g;
}

export function owlAndMoon(): Canvas {
  const g = new Canvas(26, 28);
  crescent(g, 19, 7, 6, 3, -2);
  // The owl: body, pale belly, ear tufts, wings.
  g.disc(11, 15, 7, P.brown, 8);
  g.disc(11, 17.5, 4.5, P.tan, 5);
  g.poly(
    [
      [5, 9],
      [6, 4],
      [9, 8],
    ],
    P.brown,
  );
  g.poly(
    [
      [13, 8],
      [16, 4],
      [17, 9],
    ],
    P.brown,
  );
  // The branch with leaves.
  g.rect(0, 23, 25, 24, P.brown);
  g.rect(19, 22, 21, 22, P.brown);
  g.disc(22, 21, 1.6, P.lightGreen);
  g.disc(3, 22, 1.6, P.darkGreen);
  line(g);
  // Big eyes and a beak.
  for (const x of [8, 14]) {
    g.disc(x + 0.5, 11.5, 2.4, P.white);
    g.disc(x + 0.5, 11.5, 1.1, P.black);
  }
  g.rect(11, 13, 11, 14, P.orange);
  for (const [x, y] of [
    [3, 2],
    [24, 15],
  ] as const)
    g.star(x, y, P.yellow);
  return g;
}

export function tripleMoon(): Canvas {
  const g = new Canvas(34, 16);
  // Waxing, full and waning: the goddess symbol, a clear gap between each.
  crescent(g, 5.5, 8, 5, -2.6, 0);
  crescent(g, 28.5, 8, 5, 2.6, 0);
  g.disc(17, 8, 5.5, P.yellow);
  g.disc(15.5, 6.5, 1.3, P.ochre);
  g.disc(18.5, 10, 1.5, P.ochre);
  g.disc(18.5, 5.5, 0.7, P.ochre);
  line(g);
  for (const [x, y] of [
    [1, 1],
    [32, 14],
    [11, 1],
  ] as const)
    g.star(x, y, P.white, 0);
  return g;
}

/** Finale: the moon over still water, "AS ABOVE" in the sky and "SO BELOW" in the lake. */
export function asAbove(): Canvas {
  const g = new Canvas(32, 32);
  // Sky and lake.
  g.rect(0, 0, 31, 15, P.navy);
  g.rect(0, 16, 31, 31, P.blue);
  // The moon and its broken reflection.
  g.disc(16, 11.5, 4.5, P.yellow);
  g.disc(15, 10.5, 1, P.ochre);
  for (const [y, w] of [
    [17, 4],
    [19, 3],
    [21, 2],
  ] as const)
    g.rect(16 - w, y, 15 + w, y, P.yellow);
  // A line of hills on the far shore.
  g.poly(
    [
      [0, 16],
      [0, 13],
      [6, 11],
      [11, 15],
      [22, 15],
      [27, 12],
      [31, 13],
      [31, 16],
    ],
    P.darkGreen,
  );
  g.rect(0, 16, 31, 16, P.skyBlue);
  g.outline(P.black, { around: [P.yellow], outside: false });
  g.textCentred(16, 1, "AS ABOVE", P.white);
  g.textCentred(16, 25, "SO BELOW", P.white);
  // Stars and their reflections.
  for (const [x, y] of [
    [3, 8],
    [27, 7],
    [8, 9],
    [24, 10],
  ] as const) {
    g.set(x, y, P.yellow);
    g.set(x, 31 - y + 1, P.skyBlue);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Chapter 5: Familiars & Spirits
// ---------------------------------------------------------------------------------------------

export function toad(): Canvas {
  const g = new Canvas(26, 22);
  // The lily pad, with its notch.
  g.disc(13, 17.5, 12, P.darkGreen, 4);
  g.poly(
    [
      [13, 17],
      [16, 22],
      [19, 22],
    ],
    null,
  );
  // The toad: a wide body, spotted, legs folded, eyes on top.
  g.disc(13, 12, 7, P.lightGreen, 5.5);
  g.disc(8, 7, 2.4, P.lightGreen);
  g.disc(18, 7, 2.4, P.lightGreen);
  g.disc(6, 15, 2.5, P.lightGreen, 1.8);
  g.disc(20, 15, 2.5, P.lightGreen, 1.8);
  for (const [x, y] of [
    [10, 11],
    [16, 12],
    [13, 9],
  ] as const)
    g.set(x, y, P.darkGreen);
  line(g);
  for (const x of [8, 18]) {
    g.set(x, 7, P.yellow);
    g.set(x - 1, 7, P.yellow);
    g.set(x, 6, P.black);
  }
  g.rect(11, 13, 15, 13, P.pink);
  g.star(2, 3, P.yellow);
  g.star(23, 2, P.white, 0);
  return g;
}

export function raven(): Canvas {
  const g = new Canvas(26, 26);
  // A full moon behind it.
  g.disc(16, 9, 7, P.lightGrey);
  // The raven: body, head, tail, beak.
  g.disc(11, 14, 5.5, P.black, 4.2);
  g.disc(15, 9, 3, P.black);
  g.poly(
    [
      [7, 15],
      [1, 20],
      [5, 20],
      [9, 17],
    ],
    P.black,
  );
  g.poly(
    [
      [17.5, 8],
      [21.5, 9.5],
      [17.5, 10.5],
    ],
    P.grey,
  );
  // The branch.
  g.rect(0, 19, 25, 20, P.brown);
  g.line(10, 18, 9, 19, P.ochre);
  g.line(13, 18, 14, 19, P.ochre);
  g.outline(P.white, { around: [P.black], outside: true });
  g.outline(P.black, { around: [P.lightGrey, P.brown, P.grey] });
  g.set(15, 8, P.yellow);
  g.star(3, 3, P.yellow);
  g.star(23, 22, P.yellow, 0);
  return g;
}

export function spiderWeb(): Canvas {
  const g = new Canvas(30, 30);
  const cx = 15;
  const cy = 13;
  // Spokes and the spiral rings between them, in silver.
  const spokes = 8;
  for (let k = 0; k < spokes; k++) {
    const a = (k * Math.PI * 2) / spokes;
    g.line(cx, cy, Math.round(cx + Math.cos(a) * 13), Math.round(cy + Math.sin(a) * 12), P.grey);
  }
  for (const r of [4, 8, 12]) {
    for (let k = 0; k < spokes; k++) {
      const a0 = (k * Math.PI * 2) / spokes;
      const a1 = ((k + 1) * Math.PI * 2) / spokes;
      g.line(
        Math.round(cx + Math.cos(a0) * r),
        Math.round(cy + Math.sin(a0) * r * 0.92),
        Math.round(cx + Math.cos(a1) * r),
        Math.round(cy + Math.sin(a1) * r * 0.92),
        P.lightGrey,
      );
    }
  }
  // The spider on its thread.
  g.line(22, 13, 22, 21, P.grey);
  g.disc(22, 24, 2.6, P.black);
  g.disc(22, 21, 1.6, P.black);
  for (const s of [-1, 1])
    for (const dy of [-1, 1, 3]) g.line(22 + s * 2, 23 + dy, 22 + s * 5, 22 + dy + 1, P.black);
  g.outline(P.purple, { around: [P.black] });
  g.set(22, 24, P.red);
  g.set(22, 25, P.red);
  g.set(21, 21, P.white);
  g.set(23, 21, P.white);
  return g;
}

/** Finale: a carved pumpkin on the night of the year's turning, "SAMHAIN" over it. */
export function samhain(): Canvas {
  const g = new Canvas(32, 32);
  // The pumpkin, ribbed, with its stem and a leaf.
  g.disc(16, 20, 12.5, P.orange, 10);
  g.recolour(P.ochre, (x, y, was) => was === P.orange && (x === 10 || x === 16 || x === 22));
  g.rect(15, 8, 17, 11, P.darkGreen);
  g.disc(20, 9, 2.4, P.lightGreen, 1.4);
  // A carved, glowing face.
  for (const x of [11, 21])
    g.poly(
      [
        [x - 3, 18],
        [x + 3, 18],
        [x, 14],
      ],
      P.yellow,
    );
  g.poly(
    [
      [6, 22],
      [26, 22],
      [23, 27],
      [9, 27],
    ],
    P.yellow,
  );
  g.rect(12, 22, 13, 23, P.orange);
  g.rect(19, 22, 20, 23, P.orange);
  g.rect(15, 26, 17, 27, P.orange);
  g.fillEmpty(() => P.darkPurple);
  g.outline(P.black, { around: [P.orange, P.ochre, P.darkGreen, P.lightGreen], keep: [P.yellow] });
  g.textCentred(16, 1, "SAMHAIN", P.orange);
  // Bats against the night.
  for (const [x, y] of [
    [4, 9],
    [27, 11],
  ] as const) {
    g.set(x, y, P.black);
    g.set(x - 1, y - 1, P.black);
    g.set(x + 1, y - 1, P.black);
    g.set(x - 2, y, P.black);
    g.set(x + 2, y, P.black);
  }
  g.star(29, 3, P.white, 0);
  g.star(2, 3, P.white, 0);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Chapter 6: The Grimoire
// ---------------------------------------------------------------------------------------------

export function pentacle(): Canvas {
  const g = new Canvas(24, 24);
  g.disc(12, 12, 11, P.purple);
  g.star5(12, 12.6, 9.6, P.yellow);
  g.disc(12, 12.6, 3, P.lightPurple);
  g.ring(12, 12, 11, 1.4, P.ochre);
  line(g);
  return g;
}

export function tarotStar(): Canvas {
  const g = new Canvas(22, 30);
  // A card: a gold border round a night field, a pale label at the foot.
  g.rect(0, 0, 21, 29, P.ochre);
  g.rect(2, 2, 19, 21, P.navy);
  g.rect(2, 22, 19, 27, P.white);
  g.star5(11, 11, 7.5, P.yellow);
  line(g);
  g.star(5, 5, P.white, 0);
  g.star(16, 18, P.white, 0);
  g.star(16, 5, P.lightPurple, 0);
  g.star(5, 18, P.lightPurple, 0);
  g.textCentred(11, 23, "STAR", P.navy);
  return g;
}

export function wheelOfYear(): Canvas {
  const g = new Canvas(30, 30);
  const cx = 15;
  const cy = 15;
  // Eight festivals, eight colours round the year.
  const season = [P.skyBlue, P.lightGreen, P.pink, P.yellow, P.orange, P.red, P.purple, P.blue];
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 30; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > 13.5 || d < 4) continue;
      const a = (Math.atan2(y + 0.5 - cy, x + 0.5 - cx) + Math.PI * 2.5) % (Math.PI * 2);
      g.set(x, y, season[Math.floor((a / (Math.PI * 2)) * 8)]!);
    }
  // The sun at the hub.
  g.disc(cx, cy, 3.5, P.yellow);
  g.outline(P.black);
  g.disc(cx, cy, 1.5, P.orange);
  return g;
}

/** Finale: an open grimoire on a dark altar, "SO MOTE IT BE" above it. */
export function grimoire(): Canvas {
  const g = new Canvas(32, 32);
  // The book: a leather cover, two pale pages, a red ribbon.
  g.rect(1, 14, 30, 30, P.brown);
  g.rect(3, 15, 15, 28, P.tan);
  g.rect(16, 15, 28, 28, P.tan);
  g.rect(15, 14, 16, 30, P.black);
  g.rect(22, 28, 23, 31, P.red);
  g.fillEmpty(() => P.darkPurple);
  g.outline(P.black, { around: [P.brown] });
  // A pentacle on the left page, lines of writing on the right.
  g.ring(9, 21.5, 5, 1, P.purple);
  g.star5(9, 21.8, 4.2, P.purple);
  for (let y = 17; y <= 26; y += 2)
    for (let x = 18; x <= 26; x++) if ((x * 7 + y) % 5 !== 0) g.set(x, y, P.brown);
  g.textCentred(16, 1, "SO MOTE", P.yellow);
  g.textCentred(16, 7, "IT BE", P.yellow);
  g.star(2, 4, P.white, 0);
  g.star(29, 10, P.white, 0);
  return g;
}
