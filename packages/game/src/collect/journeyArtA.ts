import { FAMILIES, PICTURE_PALETTE as P } from "./pictureBoard";
import { Canvas } from "./pixelCanvas";

/**
 * The journey's pictures, chapters 1 to 3 (M15.13): The Calling, Hedge & Herbs, Crystals. Each is an
 * original design in the bordered style: flat colour regions with a one-cell line round and between
 * them, details (eyes, sparkles, letters) added after the line so they stay crisp. Each chapter's
 * last picture fills its whole board and carries a word.
 */

/** Deterministic scatter of sparkles over the empty (or `on`-coloured) cells of `g`. */
function sparkles(g: Canvas, at: readonly [number, number][], c: string = P.yellow, arm = 1): void {
  for (const [x, y] of at) g.star(x, y, c, arm);
}

// ---------------------------------------------------------------------------------------------
// Chapter 1: The Calling
// ---------------------------------------------------------------------------------------------

export function candle(): Canvas {
  const g = new Canvas(22, 28);
  // Flame: an orange teardrop, a yellow heart and a white core.
  g.poly(
    [
      [11, 1],
      [14.5, 7],
      [11, 11],
      [7.5, 7],
    ],
    P.orange,
  );
  g.disc(11, 7.5, 3.2, P.orange, 3);
  g.disc(11, 8, 2, P.yellow, 2.4);
  g.disc(11, 8.7, 1, P.white, 1.5);
  // The candle: purple wax with a light side, melted wax round the top and running down.
  g.rect(7, 12, 14, 23, P.purple);
  g.rect(8, 13, 8, 22, P.lightPurple);
  g.rect(7, 12, 14, 12, P.lightPurple);
  g.rect(13, 13, 13, 16, P.lightPurple);
  g.rect(10, 13, 10, 14, P.lightPurple);
  // The holder: a brass dish with a ring to carry it.
  g.rect(3, 24, 18, 25, P.ochre);
  g.rect(5, 26, 16, 26, P.brown);
  g.ring(19.5, 23.5, 2.6, 1.2, P.ochre);
  g.outline(P.black, { keep: [P.yellow, P.white], families: FAMILIES });
  g.dot(11, 11, P.black);
  sparkles(g, [
    [2, 4],
    [19, 3],
    [3, 15],
  ]);
  g.star(18, 12, P.white, 0);
  return g;
}

export function witchsHat(): Canvas {
  const g = new Canvas(26, 26);
  // The brim, then the cone with its tip bent over.
  g.disc(13, 20.5, 12, P.darkPurple, 3);
  g.poly(
    [
      [7, 20],
      [19, 20],
      [16, 9],
      [21, 3],
      [12, 6],
    ],
    P.purple,
  );
  // An orange band and a gold buckle.
  g.recolour(P.orange, (x, y, was) => was === P.purple && y >= 16 && y <= 18);
  g.rect(11, 16, 14, 18, P.yellow);
  g.rect(12, 17, 13, 17, P.orange);
  // A light fold on the cone.
  g.recolour(P.lightPurple, (x, y, was) => was === P.purple && x >= 13 && x <= 14 && y >= 8);
  g.outline(P.black, { families: FAMILIES });
  g.star5(10, 11, 1.8, P.yellow);
  // A crescent moon and sparkles.
  g.disc(4, 5, 2.6, P.yellow);
  g.disc(5.2, 4.2, 2.1, null);
  sparkles(g, [
    [22, 10],
    [3, 13],
  ]);
  g.star(24, 2, P.white, 0);
  return g;
}

export function broom(): Canvas {
  const g = new Canvas(30, 30);
  // The handle, corner to corner.
  g.poly(
    [
      [25, 2],
      [28, 5],
      [14, 19],
      [11, 16],
    ],
    P.brown,
  );
  g.line(26, 4, 13, 17, P.tan);
  // Bristles: a fan of straw, streaked darker.
  g.poly(
    [
      [12, 15],
      [16, 19],
      [10, 29],
      [1, 28],
      [1, 21],
    ],
    P.yellow,
  );
  g.recolour(P.ochre, (x, y, was) => was === P.yellow && (x + y) % 3 === 0);
  // The red cord that binds it.
  g.poly(
    [
      [11, 14],
      [17, 19],
      [15, 21],
      [9, 16],
    ],
    P.red,
  );
  g.outline(P.black, { families: FAMILIES });
  // A trail of sparkles where it flew.
  sparkles(g, [
    [21, 22],
    [26, 16],
    [17, 26],
  ]);
  g.star(25, 26, P.white, 0);
  g.star(4, 4, P.white, 0);
  g.disc(6, 7, 2.8, P.yellow);
  g.disc(7.3, 6, 2.3, null);
  return g;
}

/** Finale: a black cat before the full moon, "BLESSED BE" on a scroll. */
export function blessedCat(): Canvas {
  const g = new Canvas(32, 32);
  // The moon.
  g.disc(21, 8, 7, P.yellow);
  g.disc(18, 6, 1.4, P.ochre);
  g.disc(24, 11, 1.8, P.ochre);
  g.disc(22, 4, 0.9, P.ochre);
  // The cat, sitting: body, head, ears and a curled tail.
  g.disc(12, 15, 5.5, P.black, 4.5);
  g.disc(12, 8.5, 3.8, P.black, 3.4);
  g.poly(
    [
      [8.5, 7],
      [9.2, 2.5],
      [11.5, 5.5],
    ],
    P.black,
  );
  g.poly(
    [
      [12.5, 5.5],
      [14.8, 2.5],
      [15.5, 7],
    ],
    P.black,
  );
  g.poly(
    [
      [16, 18],
      [20, 18],
      [21, 13],
      [19.5, 12],
      [18.5, 16],
    ],
    P.black,
  );
  // The scroll, with rolled ends.
  g.rect(2, 20, 29, 31, P.tan);
  g.rect(0, 21, 1, 30, P.ochre);
  g.rect(30, 21, 31, 30, P.ochre);
  // The night behind, a light line round the cat, a dark edge round the scroll.
  g.fillEmpty(() => P.navy);
  g.outline(P.lightPurple, { around: [P.black] });
  g.outline(P.black, { around: [P.tan, P.ochre] });
  // Eyes, nose, stars and the words.
  g.dot(10, 8, P.lightGreen);
  g.dot(14, 8, P.lightGreen);
  g.dot(12, 10, P.pink);
  for (const [x, y] of [
    [3, 3],
    [6, 1],
    [28, 17],
    [2, 12],
    [30, 1],
    [25, 17],
  ] as const)
    g.dot(x, y, P.white);
  g.star(4, 7, P.yellow);
  g.star(29, 14, P.yellow);
  g.textCentred(16, 21, "BLESSED", P.darkPurple);
  g.textCentred(16, 27, "BE", P.darkPurple);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Chapter 2: Hedge & Herbs
// ---------------------------------------------------------------------------------------------

export function lavender(): Canvas {
  const g = new Canvas(22, 28);
  const tips: [number, number][] = [
    [5, 5],
    [11, 2],
    [17, 5],
  ];
  // Stems from one knot, then buds along the top of each, two purples in turn.
  for (const [x, y] of tips) g.line(11, 24, x, y + 6, P.darkGreen);
  tips.forEach(([x, y], k) => {
    for (let i = 0; i < 4; i++)
      g.disc(
        x + 0.5 + ((11 - x) * i) / 18,
        y + 0.5 + i * 1.7,
        1.25,
        (i + k) % 2 ? P.purple : P.lightPurple,
      );
  });
  // Leaves.
  g.poly(
    [
      [11, 18],
      [6, 15],
      [8, 19],
    ],
    P.lightGreen,
  );
  g.poly(
    [
      [11, 20],
      [17, 16],
      [15, 21],
    ],
    P.lightGreen,
  );
  // A pink ribbon bow round the stems.
  g.poly(
    [
      [11, 22],
      [6, 19],
      [6, 25],
    ],
    P.pink,
  );
  g.poly(
    [
      [11, 22],
      [16, 19],
      [16, 25],
    ],
    P.pink,
  );
  g.rect(10, 21, 12, 23, P.red);
  g.line(10, 24, 8, 27, P.red);
  g.line(12, 24, 14, 27, P.red);
  g.outline(P.black, { families: FAMILIES });
  sparkles(g, [
    [2, 12],
    [20, 13],
  ]);
  return g;
}

export function mortar(): Canvas {
  const g = new Canvas(26, 26);
  // The stone bowl: a body, a light rim and a dark green mash inside, on a foot.
  g.disc(13, 13, 11, P.grey, 9);
  g.rect(0, 0, 25, 12, null);
  g.disc(13, 12.5, 11, P.lightGrey, 2.2);
  g.disc(13, 12.5, 8.5, P.darkGreen, 1.2);
  g.recolour(P.lightGrey, (x, y, was) => was === P.grey && x >= 5 && x <= 6 && y >= 14 && y <= 18);
  g.rect(8, 22, 18, 24, P.grey);
  // Herbs over the rim and the pestle leaning in.
  g.poly(
    [
      [7, 12],
      [4, 4],
      [9, 9],
    ],
    P.lightGreen,
  );
  g.poly(
    [
      [9, 12],
      [10, 3],
      [12, 10],
    ],
    P.lightGreen,
  );
  g.poly(
    [
      [19, 1],
      [22, 3],
      [15, 12],
      [12, 10],
    ],
    P.brown,
  );
  g.disc(20.6, 2, 1.8, P.tan);
  g.outline(P.black, { families: FAMILIES });
  g.dot(2, 2, P.lightGreen);
  g.dot(24, 8, P.lightGreen);
  return g;
}

export function mandrake(): Canvas {
  const g = new Canvas(28, 30);
  // Leaves fanning out of the top.
  for (const [x, y, c] of [
    [8, 4, P.darkGreen],
    [14, 1, P.lightGreen],
    [20, 4, P.darkGreen],
    [11, 3, P.lightGreen],
    [17, 3, P.lightGreen],
  ] as const)
    g.poly(
      [
        [14, 11],
        [x - 2, y + 2],
        [x, y],
        [x + 2, y + 2],
      ],
      c,
    );
  // The root: a body with arms and legs, streaked brown.
  g.disc(14, 16, 5.5, P.tan, 6.5);
  g.poly(
    [
      [9, 14],
      [3, 18],
      [4, 19],
      [10, 17],
    ],
    P.tan,
  );
  g.poly(
    [
      [19, 14],
      [25, 17],
      [24, 18],
      [18, 17],
    ],
    P.tan,
  );
  g.poly(
    [
      [11, 20],
      [9, 26],
      [11, 26],
      [13, 21],
    ],
    P.tan,
  );
  g.poly(
    [
      [15, 21],
      [18, 26],
      [19, 25],
      [17, 20],
    ],
    P.tan,
  );
  g.recolour(P.brown, (x, y, was) => was === P.tan && (x * 3 + y) % 11 === 0 && y > 12);
  // Soil and grass.
  g.rect(0, 26, 27, 29, P.brown);
  g.rect(0, 26, 27, 26, P.darkGreen);
  g.outline(P.black, { families: FAMILIES });
  // A screaming little face.
  g.dot(12, 14, P.black);
  g.dot(16, 14, P.black);
  g.rect(13, 17, 15, 18, P.red);
  for (const x of [3, 9, 20, 25]) g.dot(x, 25, P.lightGreen);
  return g;
}

/** Finale: a cauldron on the fire, "BREW" in the steam. */
export function brewCauldron(): Canvas {
  const g = new Canvas(32, 32);
  // Flames under the pot.
  for (const [x, h] of [
    [9, 5],
    [13, 6],
    [17, 7],
    [21, 6],
    [24, 4],
  ] as const) {
    g.poly(
      [
        [x - 2.5, 31],
        [x, 31 - h - 1],
        [x + 2.5, 31],
      ],
      P.orange,
    );
    g.poly(
      [
        [x - 1.2, 31],
        [x, 31 - h + 2],
        [x + 1.2, 31],
      ],
      P.yellow,
    );
  }
  // The pot, its rim and the green brew.
  g.disc(16, 20, 11, P.black, 8);
  g.rect(3, 9, 28, 13, null);
  g.rect(4, 12, 27, 13, P.grey);
  g.disc(16, 12, 10, P.lightGreen, 1.6);
  g.rect(0, 0, 31, 11, null);
  // Bubbles and drips of brew.
  g.disc(11, 10.5, 1.6, P.lightGreen);
  g.disc(20, 10, 2, P.lightGreen);
  g.disc(16, 9, 1.2, P.lightGreen);
  // Steam curling up.
  for (const [x, y] of [
    [10, 8],
    [21, 7],
  ] as const)
    g.ring(x, y, 2.4, 1, P.lightPurple);
  g.fillEmpty(() => P.darkPurple);
  g.outline(P.grey, { around: [P.black] });
  g.outline(P.black, { around: [P.lightGreen, P.orange], keep: [P.yellow] });
  g.textCentred(16, 1, "BREW", P.lightGreen);
  g.dot(20, 10, P.white);
  g.dot(11, 10, P.white);
  for (const [x, y] of [
    [2, 2],
    [29, 3],
    [3, 16],
    [29, 18],
  ] as const)
    g.star(x, y, P.yellow, 0);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Chapter 3: Crystals
// ---------------------------------------------------------------------------------------------

export function quartz(): Canvas {
  const g = new Canvas(22, 28);
  // One tall six-sided point: a light face, a clear middle, a shaded face.
  g.poly(
    [
      [6, 22],
      [6, 9],
      [11, 2],
      [16, 9],
      [16, 22],
    ],
    P.skyBlue,
  );
  g.poly(
    [
      [6, 22],
      [6, 9],
      [11, 2],
      [9, 9],
      [9, 22],
    ],
    P.white,
  );
  g.poly(
    [
      [13, 22],
      [13, 9],
      [11, 2],
      [16, 9],
      [16, 22],
    ],
    P.blue,
  );
  // Two small points at its feet and the rock.
  g.poly(
    [
      [2, 23],
      [3, 17],
      [6, 23],
    ],
    P.lightPurple,
  );
  g.poly(
    [
      [16, 23],
      [19, 18],
      [20, 23],
    ],
    P.lightPurple,
  );
  g.rect(1, 23, 20, 25, P.grey);
  g.outline(P.black, { families: FAMILIES });
  sparkles(g, [
    [3, 4],
    [19, 9],
  ]);
  g.star(9, 6, P.white, 0);
  return g;
}

export function amethyst(): Canvas {
  const g = new Canvas(28, 26);
  const point = (x: number, base: number, h: number, w: number, c: string, side: string) => {
    g.poly(
      [
        [x - w, base],
        [x - w, base - h + w],
        [x, base - h],
        [x + w, base - h + w],
        [x + w, base],
      ],
      c,
    );
    g.poly(
      [
        [x + 0.5, base],
        [x + 0.5, base - h + w],
        [x, base - h],
        [x + w, base - h + w],
        [x + w, base],
      ],
      side,
    );
  };
  point(4.5, 20, 8, 1.6, P.lightPurple, P.purple);
  point(23.5, 20, 9, 1.6, P.lightPurple, P.purple);
  point(9, 20, 13, 1.8, P.purple, P.darkPurple);
  point(19, 20, 14, 1.8, P.purple, P.darkPurple);
  point(14, 20, 19, 2.2, P.lightPurple, P.purple);
  // The geode's rock.
  g.disc(14, 22, 13, P.grey, 4);
  g.rect(0, 17, 27, 19, null);
  g.rect(2, 20, 25, 20, P.lightGrey);
  g.outline(P.black, { families: FAMILIES });
  sparkles(g, [
    [3, 5],
    [25, 6],
  ]);
  g.star(13, 6, P.white, 0);
  return g;
}

export function crystalBall(): Canvas {
  const g = new Canvas(28, 30);
  // The ball: deep glass, a lighter body, a dark swirl.
  g.disc(14, 12.5, 11, P.purple);
  g.disc(12.5, 11, 8, P.lightPurple);
  g.disc(16, 15, 5.5, P.purple);
  g.disc(17.5, 16.5, 3, P.darkPurple);
  // The brass stand.
  g.rect(8, 23, 20, 24, P.yellow);
  g.poly(
    [
      [10, 25],
      [18, 25],
      [20, 27],
      [8, 27],
    ],
    P.ochre,
  );
  g.rect(5, 27, 23, 29, P.brown);
  g.outline(P.black, { families: FAMILIES });
  // Glints and stars inside the glass.
  g.disc(9, 7, 2, P.white);
  g.star(18, 8, P.yellow);
  g.star(11, 16, P.yellow, 0);
  g.star(14, 12, P.white, 0);
  sparkles(g, [
    [2, 2],
    [25, 4],
  ]);
  g.star(25, 20, P.white, 0);
  return g;
}

/** Finale: a crystal grid round a heart stone, "CHARGE" above it. */
export function crystalGrid(): Canvas {
  const g = new Canvas(32, 32);
  const cx = 16;
  const cy = 18;
  // The circle the stones are laid on, and the lines between them.
  g.ring(cx, cy, 12.5, 1.2, P.lightGrey);
  const stones = [P.pink, P.skyBlue, P.lightGreen, P.yellow, P.orange, P.lightPurple];
  const at = stones.map((_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 3;
    return [Math.round(cx + Math.cos(a) * 9.5), Math.round(cy + Math.sin(a) * 9.5)] as const;
  });
  for (let k = 0; k < 6; k++) {
    const [x0, y0] = at[k]!;
    const [x1, y1] = at[(k + 2) % 6]!;
    g.line(x0, y0, x1, y1, P.lightGrey);
  }
  // Six stones on the points, the heart stone in the middle.
  at.forEach(([x, y], k) =>
    g.poly(
      [
        [x + 0.5, y - 2.5],
        [x + 2.5, y + 0.5],
        [x + 0.5, y + 3.5],
        [x - 1.5, y + 0.5],
      ],
      stones[k]!,
    ),
  );
  g.poly(
    [
      [cx + 0.5, cy - 5],
      [cx + 4, cy + 0.5],
      [cx + 0.5, cy + 6],
      [cx - 3, cy + 0.5],
    ],
    P.purple,
  );
  g.poly(
    [
      [cx + 0.5, cy - 5],
      [cx + 0.5, cy + 6],
      [cx - 3, cy + 0.5],
    ],
    P.lightPurple,
  );
  g.fillEmpty(() => P.navy);
  g.outline(P.black, { around: [...stones, P.purple, P.lightPurple], families: FAMILIES });
  g.textCentred(16, 0, "CHARGE", P.yellow);
  for (const [x, y] of [
    [2, 8],
    [29, 9],
    [3, 29],
    [28, 29],
  ] as const)
    g.star(x, y, P.yellow, 0);
  return g;
}
