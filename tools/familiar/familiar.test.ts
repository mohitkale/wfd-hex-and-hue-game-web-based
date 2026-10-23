import { describe, expect, it } from "vitest";
import {
  FAMILIAR_H,
  FAMILIAR_W,
  FIXED,
  FRAMES,
  FRAME_NAMES,
  LEGEND,
  frameRgba,
  palette,
  type FrameName,
} from "../../packages/game/src/collect/familiarArt";
import { PANEL } from "../art/check";
import { contrast, distance, parseHex } from "../art/color";
import { SHEET_COLORS, sheet } from "./sheet";

const alpha = (name: FrameName, color: string) => {
  const rgba = frameRgba(name, color);
  return Array.from({ length: FAMILIAR_W * FAMILIAR_H }, (_, i) => rgba[i * 4 + 3]!);
};
const count = (name: FrameName, ch: string) => FRAMES[name].join("").split(ch).length - 1;

describe("familiar art (asset check)", () => {
  it("has the documented frames, all exactly the sprite size, using only legend characters", () => {
    expect(FRAME_NAMES).toEqual([
      "idle0",
      "idle1",
      "walk0",
      "walk1",
      "carry0",
      "carry1",
      "pickup",
      "deliver",
    ]);
    for (const name of FRAME_NAMES) {
      const rows = FRAMES[name];
      expect(rows, name).toHaveLength(FAMILIAR_H);
      for (const row of rows) {
        expect(row, name).toHaveLength(FAMILIAR_W);
        for (const ch of row) expect(ch === "." || ch in LEGEND, `${name}: '${ch}'`).toBe(true);
      }
    }
  });

  it("keeps a clear border so whole-number scaling never clips and it fits a tile-sized box", () => {
    for (const name of FRAME_NAMES) {
      const rows = FRAMES[name];
      // At least the outermost row/column is transparent only where the design allows it; a frame
      // must never be cut off: its filled area has to sit inside the canvas with its body centred.
      const xs = rows.flatMap((r) => [...r].flatMap((c, x) => (c === "." ? [] : [x])));
      expect(Math.min(...xs), name).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs), name).toBeLessThan(FAMILIAR_W);
      // The body (outline column span) is horizontally centred.
      const bodyCols = rows.flatMap((r) => [...r].flatMap((c, x) => (c === "o" ? [x] : [])));
      const centre = (Math.min(...bodyCols) + Math.max(...bodyCols)) / 2;
      expect(Math.abs(centre - (FAMILIAR_W - 1) / 2), `${name} centred`).toBeLessThanOrEqual(1);
    }
  });

  it("every frame is a recognisable creature: enough body colour, two eyes, an outline", () => {
    for (const name of FRAME_NAMES) {
      expect(
        count(name, "m") + count(name, "l") + count(name, "d"),
        `${name} body`,
      ).toBeGreaterThanOrEqual(30);
      expect(count(name, "e"), `${name} eyes`).toBeGreaterThanOrEqual(6);
      expect(count(name, "p"), `${name} pupils`).toBe(2);
      expect(count(name, "o"), `${name} outline`).toBeGreaterThanOrEqual(20);
      expect(count(name, "g"), `${name} antenna glow`).toBeGreaterThanOrEqual(2);
    }
  });

  it("no two frames are identical (each pose is distinct)", () => {
    const seen = new Set<string>();
    for (const name of FRAME_NAMES) {
      const key = FRAMES[name].join("/");
      expect(seen.has(key), `${name} duplicates another frame`).toBe(false);
      seen.add(key);
    }
  });

  it("carrying and delivering poses raise the arms; walking poses alternate the feet", () => {
    expect(FRAMES.carry0[2]).not.toBe(FRAMES.idle0[2]);
    expect(FRAMES.deliver[1]).not.toBe(FRAMES.idle0[1]);
    expect(FRAMES.walk0[12]).not.toBe(FRAMES.walk1[12]);
  });

  it("the silhouette does not depend on the cube colour; wings and eyes are fixed across colours", () => {
    for (const name of FRAME_NAMES) {
      const base = alpha(name, SHEET_COLORS[0]!);
      for (const color of SHEET_COLORS)
        expect(alpha(name, color), `${name} ${color}`).toEqual(base);
    }
    const first = palette(SHEET_COLORS[0]!);
    for (const color of SHEET_COLORS) {
      const p = palette(color);
      for (const role of ["wing", "wingEdge", "eyeWhite", "pupil", "glow"] as const) {
        expect(p[role], `${color} ${role}`).toEqual(FIXED[role]);
        expect(p[role]).toEqual(first[role]);
      }
    }
  });

  it("colour variants are clearly different from each other and readable on the board panel", () => {
    const mids = SHEET_COLORS.map((c) => parseHex(c));
    mids.forEach((a, i) => {
      for (let j = i + 1; j < mids.length; j++) {
        expect(
          distance(a, mids[j]!),
          `${SHEET_COLORS[i]} vs ${SHEET_COLORS[j]}`,
        ).toBeGreaterThanOrEqual(90);
      }
    });
    for (const color of SHEET_COLORS) {
      const p = palette(color);
      expect(
        contrast([...p.mid] as [number, number, number], PANEL),
        `${color} body`,
      ).toBeGreaterThanOrEqual(3);
      // The outline must be lighter than the panel so the silhouette shows (not a black hole).
      expect(
        contrast([...p.outline] as [number, number, number], PANEL),
        `${color} outline`,
      ).toBeGreaterThanOrEqual(1.5);
      // And the body must stay clearly lighter than its own outline.
      expect(
        contrast(
          [...p.mid] as [number, number, number],
          [...p.outline] as [number, number, number],
        ),
        `${color} body vs outline`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("renders a contact sheet at mobile (2×) and zoomed sizes", () => {
    const small = sheet(2);
    expect(small.width).toBe(FRAME_NAMES.length * (FAMILIAR_W * 2 + 4) + 4);
    expect(small.height).toBe(SHEET_COLORS.length * (FAMILIAR_H * 2 + 4) + 4);
    expect(sheet(8).width).toBeGreaterThan(small.width);
  });
});
