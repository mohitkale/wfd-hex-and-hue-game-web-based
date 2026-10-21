import { describe, expect, it } from "vitest";
import { trackFor } from "@hexhue/core";
import { cellCenter, computeLayout } from "./layout";
import {
  LAUNCH_FLIGHT_MS,
  TICK_MS,
  accumulate,
  approach,
  flightPoint,
  trackPosition,
} from "./motion";

const layout = computeLayout({
  width: 750,
  height: 1624,
  dpr: 2,
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  boardWidth: 4,
  boardHeight: 3,
  slots: 5,
  columns: 2,
});
const track = trackFor(4, 3);

describe("trackPosition", () => {
  it("holds a just-launched wisp on the entry", () => {
    expect(trackPosition(layout, track, { pos: 0, traveled: 0 }, 0.7)).toEqual(
      cellCenter(layout, -1, 3),
    );
  });

  it("interpolates from the previous track cell to the current one", () => {
    const a = cellCenter(layout, -1, 3); // track[0]
    const b = cellCenter(layout, 0, 3); // track[1]
    expect(trackPosition(layout, track, { pos: 1, traveled: 1 }, 0)).toEqual(a);
    expect(trackPosition(layout, track, { pos: 1, traveled: 1 }, 1)).toEqual(b);
    expect(trackPosition(layout, track, { pos: 1, traveled: 1 }, 0.5)).toEqual({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });
  });

  it("wraps from the last cell back to the entry at lap end", () => {
    const last = track[track.length - 1]!;
    const p = trackPosition(layout, track, { pos: 0, traveled: track.length }, 0);
    expect(p).toEqual(cellCenter(layout, last.x, last.y));
  });

  it("clamps alpha", () => {
    expect(trackPosition(layout, track, { pos: 1, traveled: 1 }, 3)).toEqual(
      cellCenter(layout, 0, 3),
    );
  });
});

describe("approach", () => {
  it("moves towards the target, faster with larger dt, without overshooting", () => {
    const small = approach(0, 100, 8);
    const large = approach(0, 100, 32);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThan(100);
    expect(approach(100, 100, 16)).toBe(100);
  });
});

describe("accumulate", () => {
  it("runs one step per TICK_MS at 1× and twice as many at 2×", () => {
    expect(accumulate(0, TICK_MS, 1)).toEqual({ steps: 1, acc: 0 });
    expect(accumulate(0, TICK_MS, 2)).toEqual({ steps: 2, acc: 0 });
    expect(accumulate(0, TICK_MS / 2, 1)).toEqual({ steps: 0, acc: TICK_MS / 2 });
  });

  it("caps catch-up after a long pause", () => {
    const r = accumulate(0, 10_000, 2);
    expect(r.steps).toBe(4);
    expect(r.acc).toBeLessThan(TICK_MS);
  });
});

describe("flightPoint", () => {
  const from = { x: 0, y: 0 };

  it("starts at the origin and lands exactly on the moving target", () => {
    expect(flightPoint(from, { x: 100, y: 50 }, 0)).toEqual(from);
    expect(flightPoint(from, { x: 100, y: 50 }, LAUNCH_FLIGHT_MS)).toEqual({ x: 100, y: 50 });
    expect(flightPoint(from, { x: 100, y: 50 }, LAUNCH_FLIGHT_MS * 3)).toEqual({ x: 100, y: 50 });
  });

  it("locks onto a target moving at 2× track speed (no trailing lag)", () => {
    // Simulate frames at 60 fps while the target moves ~33 cells/s (2×), cell = 40 px.
    const cell = 40;
    const speed = (1000 / TICK_MS) * 2 * cell; // px per second
    let elapsed = 0;
    let p = from;
    let target = { x: 200, y: 0 };
    for (let frame = 0; frame < 20; frame++) {
      elapsed += 1000 / 60;
      target = { x: target.x + speed / 60, y: 0 };
      p = flightPoint(from, target, elapsed);
    }
    expect(p).toEqual(target);
  });

  it("eases out (covers most of the distance early)", () => {
    const half = flightPoint(from, { x: 100, y: 0 }, LAUNCH_FLIGHT_MS / 2);
    expect(half.x).toBeGreaterThan(80);
  });
});
