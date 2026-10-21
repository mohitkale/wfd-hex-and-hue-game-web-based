import { describe, expect, it } from "vitest";
import { EMPTY } from "./level";
import { buildTrack, firstInSight } from "./track";

const _ = EMPTY;

describe("buildTrack", () => {
  it("has length 2(W+H)+4 and visits every perimeter cell once", () => {
    for (const [w, h] of [
      [1, 1],
      [3, 2],
      [7, 11],
    ] as const) {
      const track = buildTrack(w, h);
      expect(track).toHaveLength(2 * (w + h) + 4);
      const keys = new Set(track.map((c) => `${c.x},${c.y}`));
      expect(keys.size).toBe(track.length);
      for (const c of track) {
        const onPerimeter = c.x === -1 || c.x === w || c.y === -1 || c.y === h;
        expect(onPerimeter).toBe(true);
      }
    }
  });

  it("starts at the bottom-left entry and moves one cell per step", () => {
    const track = buildTrack(4, 3);
    expect(track[0]).toMatchObject({ x: -1, y: 3, lane: "corner" });
    for (let i = 0; i < track.length; i++) {
      const a = track[i]!;
      const b = track[(i + 1) % track.length]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    }
  });

  it("travels right along the bottom, up the right, left along the top, down the left", () => {
    const lanes = buildTrack(2, 2).map((c) => c.lane);
    expect(lanes).toEqual([
      "corner",
      "bottom",
      "bottom",
      "corner",
      "right",
      "right",
      "corner",
      "top",
      "top",
      "corner",
      "left",
      "left",
    ]);
  });

  it("has no sight on corners and sight on every lane cell", () => {
    for (const c of buildTrack(5, 4)) {
      expect(c.sight === null).toBe(c.lane === "corner");
    }
  });
});

describe("line of sight", () => {
  // 3 wide × 2 tall:
  //   row 0:  0 1 2
  //   row 1:  3 4 5
  const W = 3;
  const H = 2;
  const track = buildTrack(W, H);
  const at = (x: number, y: number) => track.find((c) => c.x === x && c.y === y)!.sight!;
  const cellsFull = [0, 1, 2, 3, 4, 5].map(() => 0);

  it("bottom lane sees the bottom cell of its column first", () => {
    expect(firstInSight(cellsFull, at(1, H))).toBe(4);
  });
  it("right lane sees the rightmost cell of its row first", () => {
    expect(firstInSight(cellsFull, at(W, 0))).toBe(2);
  });
  it("top lane sees the top cell of its column first", () => {
    expect(firstInSight(cellsFull, at(2, -1))).toBe(2);
  });
  it("left lane sees the leftmost cell of its row first", () => {
    expect(firstInSight(cellsFull, at(-1, 1))).toBe(3);
  });

  it("skips empty cells and returns -1 for a clear line", () => {
    const cells = [_, 1, _, _, _, 0];
    expect(firstInSight(cells, at(1, H))).toBe(1); // column 1, bottom empty → top
    expect(firstInSight(cells, at(-1, 0))).toBe(1); // row 0 from the left
    expect(firstInSight(cells, at(0, -1))).toBe(-1); // column 0 is clear
    expect(firstInSight(cells, at(-1, 1))).toBe(5); // row 1 from the left
  });
});
