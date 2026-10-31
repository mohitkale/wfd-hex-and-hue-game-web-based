import { describe, expect, it } from "vitest";
import { contrast, luminance, theme } from "../theme";
import { badgeBox, badgeFontPx } from "./badgeBox";
import {
  COLUMN_VISIBLE,
  activeColumnRects,
  frontBoxRect,
  computeCollectLayout,
  hudButtonX,
  type CollectLayout,
} from "./collectLayout";
import { endCardText } from "./endCardText";
import { DEVICE_MATRIX as MATRIX } from "./deviceMatrix";
import { JOURNEY } from "./journey";
import { tonesFor } from "./cubePaint";
import { HUD_BUTTON_CSS, HUD_ZONE_CSS } from "./collectLayout";
import { numberLayout, DIGIT_EM } from "./badgeBox";
import { progressFill, progressOf, progressTrack } from "./progress";

/**
 * M14.1: the play screen on the device matrix of docs/QA.md. Sizes below are CSS px; the layout works
 * in device px, so each is divided by the device's pixel ratio.
 */

/** The matrix is the tool's list (one source), with whether the game's 480 px frame, not the window, sets the size. */
const DEVICES = MATRIX.map(([name, w, h, dpr]) => ({
  name,
  w,
  h,
  dpr,
  framed: !name.includes("landscape"),
}));

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The shapes of level the board has to carry: small, mid, and the 40×40 limit. Three working places plus
 * two waiting ones make five trays, the design; the last shape is the extreme (eight trays, six columns).
 */
const SHAPES = [
  { board: 10, slots: 2, columns: 3 },
  { board: 24, slots: 2, columns: 4 },
  { board: 40, slots: 3, columns: 4 },
  { board: 24, slots: 5, columns: 6 },
];

const layoutFor = (
  d: (typeof DEVICES)[number],
  s: (typeof SHAPES)[number],
  insets = NO_INSETS,
): CollectLayout =>
  computeCollectLayout({
    width: Math.round(d.w * d.dpr),
    height: Math.round(d.h * d.dpr),
    dpr: d.dpr,
    insets,
    boardWidth: s.board,
    boardHeight: s.board,
    slots: s.slots,
    columns: s.columns,
    fieldCap: 3,
    portalX: Math.floor((s.board - 1) / 2),
  });

const css = (l: CollectLayout, v: number) => v / l.dpr;
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("every device: an unobstructed board between the HUD and the groups", () => {
  for (const d of DEVICES)
    for (const s of SHAPES)
      it(`${d.name}, ${s.board}×${s.board}, ${3 + s.slots} trays, ${s.columns} columns`, () => {
        const l = layoutFor(d, s);
        const rows = [l.hud, l.boardRect, ...l.trays, ...l.columns];
        // Nothing leaves the frame, and the board overlaps nothing at all.
        for (const r of rows) {
          expect(r.x).toBeGreaterThanOrEqual(l.frame.x);
          expect(r.y).toBeGreaterThanOrEqual(l.frame.y);
          expect(r.x + r.w).toBeLessThanOrEqual(l.frame.x + l.frame.w);
          expect(r.y + r.h).toBeLessThanOrEqual(l.frame.y + l.frame.h);
        }
        for (const other of [l.hud, ...l.trays, ...l.columns])
          expect(overlap(l.boardRect, other)).toBe(false);
        // No two tiles of the bottom panels overlap, and the panels stack in order.
        const panels = [...l.trays, ...l.columns];
        panels.forEach((a, i) =>
          panels.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)),
        );
        expect(l.trays[0]!.y + l.trays[0]!.h).toBeLessThanOrEqual(l.columns[0]!.y);
        // The three HUD buttons sit inside the frame and keep 44 css px tap targets apart.
        const xs = [0, 1, 2].map((i) => hudButtonX(l, i, 3));
        for (const x of xs) expect(x - 22 * l.dpr).toBeGreaterThanOrEqual(l.frame.x);
        expect(css(l, xs[1]! - xs[0]!)).toBeGreaterThanOrEqual(44);
        expect(css(l, xs[2]! - xs[1]!)).toBeGreaterThanOrEqual(44);
        // The progress bar sits below the 36 css px button circles (at most one device pixel of overlap).
        const circleBottom = l.hud.y + l.hud.h / 2 + (HUD_BUTTON_CSS / 2) * l.dpr;
        if (d.framed) expect(progressTrack(l).y).toBeGreaterThanOrEqual(circleBottom - 1);
      });
});

describe("portrait phones and tablets: thumb-sized targets and readable numbers", () => {
  for (const d of DEVICES.filter((x) => x.framed))
    for (const s of SHAPES)
      it(`${d.name}, ${s.board}×${s.board}, ${3 + s.slots} trays, ${s.columns} columns`, () => {
        const l = layoutFor(d, s);
        // Summon columns are the main thing the thumb does.
        for (const c of l.columns) {
          // The tap zone spans the gap beside the box (the boxes are one tile wide).
          expect(css(l, c.w + l.gap)).toBeGreaterThanOrEqual(s.columns <= 4 ? 44 : 30);
          expect(css(l, c.h)).toBeGreaterThanOrEqual(90);
        }
        // Up to five trays (the design) are full 44 css px targets; more are narrower but never tiny.
        for (const r of l.trays)
          expect(css(l, r.w + l.gap)).toBeGreaterThanOrEqual(l.trays.length <= 5 ? 44 : 30);
        // Group numbers: big on the front group, still legible everywhere else.
        const front = badgeBox(l, "column", 0, 0);
        expect(css(l, badgeFontPx(front.w, front.h))).toBeGreaterThanOrEqual(
          s.columns <= 4 ? 17 : 14,
        );
        const tray = badgeBox(l, "tray", 0, 0);
        expect(css(l, badgeFontPx(tray.w, tray.h))).toBeGreaterThanOrEqual(
          l.trays.length <= 5 ? 14 : 10,
        );
        // The picture stays readable: cubes are not specks (and at most 16 css px, about half a
        // familiar, owner request).
        const minCell = s.board <= 10 ? 15 : s.board <= 24 ? 10 : 6.5;
        expect(css(l, l.cell)).toBeLessThanOrEqual(16.5);
        expect(css(l, l.cell)).toBeGreaterThanOrEqual(minCell);
      });
});

describe("landscape phones are playable but small (the game is portrait-first)", () => {
  it("still lays everything out, with a board you can see", () => {
    const d = DEVICES.find((x) => x.name === "Phone (landscape)")!;
    const l = layoutFor(d, SHAPES[1]!);
    expect(css(l, l.cell)).toBeGreaterThanOrEqual(6);
    // Small, but still a thumb-sized tap zone (the box and the gap beside it).
    expect(css(l, l.columns[0]!.w + l.gap)).toBeGreaterThanOrEqual(28);
  });
});

describe("safe areas", () => {
  it("a notch and a home bar push every row inside them", () => {
    const d = DEVICES[2]!;
    const insets = { top: 47 * 3, right: 0, bottom: 34 * 3, left: 0 };
    const l = layoutFor(d, SHAPES[1]!, insets);
    expect(l.hud.y).toBeGreaterThanOrEqual(insets.top);
    for (const c of l.columns) expect(c.y + c.h).toBeLessThanOrEqual(d.h * d.dpr - insets.bottom);
  });
});

describe("the group number's size", () => {
  it("is half the tile's height, and smaller only when three digits would not fit", () => {
    expect(badgeFontPx(100, 100)).toBe(45);
    expect(badgeFontPx(100, 50)).toBe(25);
    expect(badgeFontPx(40, 40)).toBe(Math.round((40 * 0.86) / (3 * 0.64)));
    expect(badgeFontPx(40, 40)).toBeLessThan(20);
  });
  it("never exceeds what fits: a 3-digit number stays inside a narrow badge", () => {
    for (const [w, h] of [
      [60, 60],
      [88, 37],
      [140, 90],
    ] as const) {
      const px = badgeFontPx(w, h);
      expect(px * 0.62 * 3, `${w}×${h}`).toBeLessThanOrEqual(w); // ~0.62 em per bold digit
    }
  });
});

describe("the progress bar", () => {
  it("counts delivered over total, never rounding up to 100% early", () => {
    expect(progressOf({ deliveredTotal: 0, cubesTotal: 400 })).toEqual({
      delivered: 0,
      total: 400,
      fraction: 0,
      percent: 0,
    });
    expect(progressOf({ deliveredTotal: 399, cubesTotal: 400 }).percent).toBe(99);
    expect(progressOf({ deliveredTotal: 400, cubesTotal: 400 }).percent).toBe(100);
    expect(progressOf({ deliveredTotal: 1, cubesTotal: 1000 }).percent).toBe(0);
  });
  it("survives nonsense: no cubes, negative or too many delivered", () => {
    expect(progressOf({ deliveredTotal: 3, cubesTotal: 0 }).fraction).toBe(0);
    expect(progressOf({ deliveredTotal: -2, cubesTotal: 10 }).fraction).toBe(0);
    expect(progressOf({ deliveredTotal: 50, cubesTotal: 10 }).fraction).toBe(1);
  });
  it("sits inside the HUD on every device and fills in proportion (a sliver once anything is delivered)", () => {
    for (const d of DEVICES) {
      const l = layoutFor(d, SHAPES[1]!);
      const track = progressTrack(l);
      expect(track.x).toBeGreaterThanOrEqual(l.frame.x);
      expect(track.x + track.w).toBeLessThanOrEqual(l.frame.x + l.frame.w);
      expect(track.y).toBeGreaterThanOrEqual(l.hud.y);
      expect(track.y + track.h).toBeLessThanOrEqual(l.hud.y + l.hud.h);
      expect(progressFill(track, 0).w).toBe(0);
      expect(progressFill(track, 1).w).toBe(track.w);
      expect(progressFill(track, 0.5).w).toBeCloseTo(track.w / 2, -1);
      expect(progressFill(track, 0.001).w).toBeGreaterThan(0);
      expect(progressFill(track, 7).w).toBe(track.w);
    }
  });
});

describe("text contrast (WCAG AA, 4.5:1) on the play screen's backgrounds", () => {
  const night = luminance("#140b2e");
  const toastBg = luminance("#2a1650");
  const pairs: [string, string, number][] = [
    ["body text on the night sky", theme.text, night],
    ["dim text on the night sky", theme.textDim, night],
    ["gold headline on the night sky", "#f6d97a", night],
    ["toast text on its pill", "#ffffff", toastBg],
    ["white text on the dark panel colour", "#ffffff", luminance("#0f0824")],
  ];
  it.each(pairs)("%s", (_name, fg, bgLum) => {
    expect(contrast(luminance(fg), bgLum)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("end card wording", () => {
  it("says what happened and why, in words a player can act on", () => {
    expect(endCardText({ won: true, lossReason: null, delivered: 40 })).toEqual({
      title: "Every cube collected!",
      detail: "Delivered 40 cubes",
    });
    expect(endCardText({ won: false, lossReason: "slotsFull", delivered: 3 }).title).toBe(
      "Out of slots",
    );
    expect(endCardText({ won: false, lossReason: "deadlock", delivered: 3 }).title).toBe("Stuck");
  });
});

describe("the HUD's tap targets", () => {
  it("the buttons are 36 css px circles inside 44 css px tap targets", () => {
    expect(HUD_BUTTON_CSS).toBe(36);
    expect(HUD_ZONE_CSS).toBeGreaterThanOrEqual(44);
  });
});

describe("the progress bar never claims more than is done", () => {
  it("is not full while a cube is still out, even on the biggest boards and the smallest phone", () => {
    for (const d of DEVICES.filter((x) => x.framed)) {
      const track = progressTrack(layoutFor(d, SHAPES[2]!));
      for (const total of [20, 1024, 1600, 100_000]) {
        const fill = progressFill(track, (total - 1) / total);
        expect(fill.w, `${d.name} ${total}`).toBeLessThan(track.w);
        expect(fill.w).toBeGreaterThan(0);
      }
      expect(progressFill(track, 1).w).toBe(track.w);
    }
  });
});

describe("a three-digit number fits the tile, on the real tiles", () => {
  for (const d of DEVICES.filter((x) => x.framed))
    for (const s of SHAPES)
      it(`${d.name}, ${3 + s.slots} trays, ${s.columns} columns`, () => {
        const l = layoutFor(d, s);
        for (const box of [badgeBox(l, "tray", 0, 0), badgeBox(l, "column", 0, 0)]) {
          const n = numberLayout(box.w, box.h);
          expect(3 * DIGIT_EM * n.fontPx, "number vs the tile").toBeLessThanOrEqual(box.w);
          expect(n.x).toBe(0);
        }
      });
});

describe("every group box is the same square, wherever it is", () => {
  for (const d of DEVICES.filter((x) => x.framed))
    for (const s of SHAPES)
      it(`${d.name}, ${3 + s.slots} trays, ${s.columns} columns`, () => {
        const l = layoutFor(d, s);
        const boxes = [
          badgeBox(l, "tray", 0, 0),
          badgeBox(l, "column", 0, 0),
          badgeBox(l, "column", 0, 1),
          badgeBox(l, "column", 0, 2),
        ];
        // The three visible boxes of a column are a grid: a real gap between them, none overlapping.
        for (let d = 1; d < 3; d++) {
          const above = boxes[d]!;
          const below = boxes[d + 1]!;
          expect(below.y - above.y, `${d}`).toBeGreaterThanOrEqual(l.tile + l.gap - 1);
        }
        for (const b of boxes) {
          expect(b.w).toBe(l.tile);
          expect(b.h).toBe(l.tile);
        }
        // Big enough to read and to tap.
        expect(css(l, l.tile), "tile css px").toBeGreaterThanOrEqual(30);
        // The three boxes of a column stay inside its zone.
        const col = l.columns[0]!;
        const last = boxes[3]!;
        expect(last.y + last.h / 2).toBeLessThanOrEqual(col.y + col.h + 1);
      });
});

describe("rings hug the box they point at", () => {
  for (const d of DEVICES.filter((x) => x.framed))
    for (const s of SHAPES)
      it(`${d.name}, ${3 + s.slots} trays, ${s.columns} columns`, () => {
        const l = layoutFor(d, s);
        const rects = activeColumnRects(
          l,
          l.columns.map(() => true),
        );
        rects.forEach((r, i) => {
          const ring = frontBoxRect(l, r!);
          const box = badgeBox(l, "column", i, 0, r!);
          expect(ring.x + ring.w / 2).toBeCloseTo(box.x, 5);
          expect(ring.y + ring.h / 2).toBeCloseTo(box.y, 5);
          expect(ring.w).toBe(box.w);
        });
      });
});

describe("a wide level (many trays or columns) still has readable boxes", () => {
  // Three working places and up to eight waiting ones (the generator's limit) is eleven trays.
  for (const d of DEVICES.filter((x) => x.framed && x.w >= 360))
    for (const slots of [5, 8]) {
      it(`${d.name}, ${3 + slots} trays`, () => {
        const l = layoutFor(d, { board: 24, slots, columns: 4 });
        expect(l.trays).toHaveLength(3 + slots);
        // Never narrower than a readable tile: the boxes shrink to fit, they do not overflow.
        expect(css(l, l.tile), "tile").toBeGreaterThanOrEqual(slots === 8 ? 22 : 30);
        const box = badgeBox(l, "tray", 0, 0);
        expect(css(l, badgeFontPx(box.w, box.h))).toBeGreaterThanOrEqual(slots === 8 ? 9 : 13);
        for (const r of l.trays) {
          expect(r.x).toBeGreaterThanOrEqual(l.frame.x);
          expect(r.x + r.w).toBeLessThanOrEqual(l.frame.x + l.frame.w);
        }
      });
    }
});

describe("columns: three boxes at most, centred as a group", () => {
  for (const d of DEVICES.filter((x) => x.framed))
    for (const s of SHAPES)
      it(`${d.name}, ${3 + s.slots} trays, ${s.columns} columns`, () => {
        const l = layoutFor(d, s);
        // Nothing is drawn around the picture, so the picture may use nearly the whole frame width.
        expect(l.boardRect.w).toBeLessThanOrEqual(l.frame.w);
        // All columns present: the layout's own rects. Fewer: centred, the same width, same order.
        const all = activeColumnRects(
          l,
          l.columns.map(() => true),
        );
        all.forEach((r, i) => expect(r).toEqual(l.columns[i]));
        for (let keep = 1; keep < l.columns.length; keep++) {
          const active = l.columns.map((_, i) => i < keep);
          const rects = activeColumnRects(l, active).filter((r) => r !== null);
          expect(rects).toHaveLength(keep);
          const left = rects[0]!.x - l.frame.x;
          const right = l.frame.x + l.frame.w - (rects.at(-1)!.x + rects[0]!.w);
          expect(Math.abs(left - right), `${keep} columns`).toBeLessThanOrEqual(1);
          rects.forEach(
            (r, i) => i > 0 && expect(r.x - rects[i - 1]!.x).toBe(l.columns[0]!.w + l.colGap),
          );
        }
        // A column with nothing left has no rect (so no tap zone).
        expect(
          activeColumnRects(
            l,
            l.columns.map((_, i) => i !== 0),
          )[0],
        ).toBeNull();
        // The column zone holds exactly three boxes and their gaps.
        expect(l.columns[0]!.h).toBe(3 * l.tile + 2 * l.gap);
        expect(COLUMN_VISIBLE).toBe(3);
      });
});

describe("white group numbers on every badge colour", () => {
  it("are at least 3.5:1 (AA for large text, which the front and field numbers are), with a dark outline for the rest", () => {
    const palettes = new Set<string>([
      "#4a6be2",
      "#e24a4a",
      "#4ae26b",
      "#f2c94c",
      "#b44ae2",
      "#4ae2d8",
    ]);
    for (const e of JOURNEY) for (const hex of e.base().palette) palettes.add(hex);
    let worst = Infinity;
    for (const hex of palettes) {
      const dark = tonesFor(hex).dark;
      const c = contrast(1, luminance("#" + dark.toString(16).padStart(6, "0")));
      worst = Math.min(worst, c);
      expect(c, hex).toBeGreaterThanOrEqual(3.5);
    }
    // Not 4.5:1 for every colour (gold, cyan and green sit near 3.7): the numbers' dark outline carries them.
    expect(worst).toBeLessThan(4.5);
  });
});

describe("the levels that ship, on the matrix", () => {
  const levels = JOURNEY.map((e) => e.make());
  for (const d of DEVICES.filter((x) => x.framed))
    it(`${d.name}: every shipped level fits, with readable cubes and numbers`, () => {
      for (const level of levels) {
        const l = computeCollectLayout({
          width: Math.round(d.w * d.dpr),
          height: Math.round(d.h * d.dpr),
          dpr: d.dpr,
          insets: NO_INSETS,
          boardWidth: level.width,
          boardHeight: level.height,
          slots: level.slots,
          columns: level.columns.length,
          fieldCap: level.fieldCap,
          sharedTrays: level.sharedTrays === true,
          portalX: level.portalX ?? Math.floor((level.width - 1) / 2),
        });
        for (const r of [...l.trays, ...l.columns]) expect(overlap(l.boardRect, r)).toBe(false);
        // The journey's finer mosaic (owner request): cubes of 4 css px and up on the smallest phone.
        expect(css(l, l.cell), `${level.id} cube`).toBeGreaterThanOrEqual(4);
        for (const c of l.columns)
          expect(css(l, c.w + l.gap), `${level.id} column`).toBeGreaterThanOrEqual(44);
        const front = badgeBox(l, "column", 0, 0);
        expect(
          css(l, badgeFontPx(front.w, front.h)),
          `${level.id} front number`,
        ).toBeGreaterThanOrEqual(14);
        for (const r of l.trays)
          expect(css(l, r.w + l.gap), `${level.id} tray`).toBeGreaterThanOrEqual(
            l.trays.length <= 5 ? 44 : 30,
          );
      }
    });
});
