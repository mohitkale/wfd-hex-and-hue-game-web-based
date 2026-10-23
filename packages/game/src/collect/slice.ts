import type * as collect from "@hexhue/core/collect";

/**
 * The v2 vertical-slice level (M10.5): "Moonlit Hat", a witch's hat under a crescent moon, hand-made
 * and hand-placed. It is the level a human plays at gate G1. Not final art: the art bible and the
 * real art set come in M11. Every number below was chosen and then checked by exhaustive search
 * (see `slice.test.ts` and `docs/V2_SLICE.md`).
 */

/** B night sky, C starlight halo, P hat, R band, Y moon and buckle, G the gem inside the buckle. */
const ART = [
  "BBBBBBCCBBYYYB",
  "BBBBBCPPCBYYBB",
  "BBBBCPPPPCYBBB",
  "BBBCPPPPPCBBCB",
  "BBBCPPPPPPCBBB",
  "BBCPPPPPPPCBBB",
  "BBCPPPPPPPPCBB",
  "BCRRRRRRRRRRCB",
  "BCRRYYYYRRRRCB",
  "BCRRYGGYRRRRCB",
  "BCPPPPPPPPPPCB",
  "CPPPPPPPPPPPPC",
  "BCCCCCCCCCCCCB",
  "BBBBBBBBBBBBBB",
];
const LEGEND = "BRGYPC";
const PALETTE = ["#4a6be2", "#e24a4a", "#4ae26b", "#f2c94c", "#b44ae2", "#4ae2d8"];

const g = (letter: string, capacity: number): collect.GroupSpec => ({
  color: LEGEND.indexOf(letter),
  capacity,
});

export function moonlitHat(): collect.CollectLevel {
  return {
    id: "slice-moonlit-hat",
    name: "Moonlit Hat",
    width: ART[0]!.length,
    height: ART.length,
    palette: PALETTE,
    cells: ART.flatMap((row) => [...row].map((c) => LEGEND.indexOf(c))),
    // Fronts at the start: gold 8, cyan 11, cyan 15. Each column is ordered front to back.
    columns: [
      [g("Y", 8), g("R", 6), g("C", 11), g("P", 30), g("R", 5)],
      [g("C", 11), g("Y", 4), g("B", 21), g("G", 2)],
      [g("C", 15), g("R", 11), g("B", 48), g("P", 24)],
    ],
    slots: 2,
    squad: 3,
    spawnGap: 2,
    fieldCap: 2,
  };
}

const pick = (column: number): collect.Action => ({ kind: "select", column });
const resume = (slot: number): collect.Action => ({ kind: "resume", slot });

/** A winning line (one of the few): taps made one at a time, each after the board settles. */
export const WIN_LINE: readonly collect.Action[] = [
  pick(1), // cyan 11: only 4 cubes are reachable yet, so it parks with 7 left (slot 1)
  pick(1), // gold 4: exactly the moon's reachable gold, completes
  pick(0), // gold 8: the buckle is still hidden, so it parks with 6 left (slot 2, now full)
  pick(1), // blue 21: peels the sky
  pick(2), // cyan 15: the halo is open now
  pick(0), // red 6
  pick(2), // red 11
  pick(2), // blue 48
  pick(0), // cyan 11
  pick(0), // purple 30
  pick(0), // red 5
  pick(1), // green 2: the gem
  pick(2), // purple 24
  resume(0), // cyan 7 left
  resume(1), // gold 6 left
];

/** Two demonstrable losses: the simplest one and the slot trap. */
export const LOSE_LINES: Record<"deadlock" | "slots", readonly collect.Action[]> = {
  /** Tap the first thing available: gold parks with the buckle hidden, cyan is next to useless. */
  deadlock: [pick(0), pick(1)],
  /** Park two groups, then start a third that cannot finish: every slot is taken. */
  slots: [pick(1), pick(0), pick(2)],
};
