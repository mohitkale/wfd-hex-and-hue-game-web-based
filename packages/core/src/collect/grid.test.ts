import { describe, expect, it } from "vitest";
import { EMPTY } from "../level";
import { createRng } from "../rng";
import { computeDist, openCell, padCells, paddedIndex, routeTo, topologyFor } from "./grid";

const at = (stride: number, x: number, y: number) => paddedIndex(stride, x, y);

describe("padded grid", () => {
  it("indexes the ring and mosaic row-major so smaller y then x is a smaller index", () => {
    const t = topologyFor(4, 3);
    expect(t.stride).toBe(6);
    expect(at(6, 0, 0)).toBe(7);
    expect(at(6, 3, 2)).toBeLessThan(at(6, 0, 3));
    expect(at(6, 0, 1)).toBeGreaterThan(at(6, 3, 0));
    // Neighbours: up, left, right, down; -1 off the grid.
    const c = at(6, 1, 1);
    expect([...t.neighbors.slice(c * 4, c * 4 + 4)]).toEqual([c - 6, c - 1, c + 1, c + 6]);
    expect([...t.neighbors.slice(0, 4)]).toEqual([-1, -1, 1, 6]);
  });

  it("pads cells with an open ring", () => {
    const grid = padCells(2, 1, [3, EMPTY]);
    expect(grid).toEqual([
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      3,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
    ]);
  });
});

describe("distance map", () => {
  it("measures walking distance from the portal through open cells only", () => {
    // 3×1: cubes in the mosaic; the ring is open.
    const t = topologyFor(3, 1);
    const grid = padCells(3, 1, [0, 0, 0]);
    const portal = at(t.stride, 1, 1);
    const dist = computeDist(t, grid, portal);
    expect(dist[portal]).toBe(0);
    expect(dist[at(t.stride, 0, 1)]).toBe(1);
    expect(dist[at(t.stride, -1, 1)]).toBe(2);
    expect(dist[at(t.stride, 1, 0)]).toBe(-1); // a cube
  });

  it("leaves sealed pockets unreachable, including diagonal-only connections (R-04, R-05)", () => {
    const t = topologyFor(4, 3);
    const rows = [".XXX", "X.YX", "XXXX"];
    const cells = rows.flatMap((r) =>
      [...r].map((ch) => (ch === "." ? EMPTY : ch === "X" ? 0 : 1)),
    );
    const grid = padCells(4, 3, cells);
    const dist = computeDist(t, grid, at(t.stride, 1, 3));
    expect(dist[at(t.stride, 0, 0)]).toBeGreaterThan(0); // open corner touches the ring
    expect(dist[at(t.stride, 1, 1)]).toBe(-1); // pocket touched only diagonally by (0,0)
  });

  it("incremental updates equal a fresh BFS on random boards (pockets, shortcuts, chains)", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = createRng(seed);
      const w = rng.int(3, 9);
      const h = rng.int(3, 9);
      const t = topologyFor(w, h);
      const cells: number[] = [];
      for (let i = 0; i < w * h; i++) cells.push(rng.next() < 0.25 ? EMPTY : 0);
      const grid = padCells(w, h, cells);
      const portal = at(t.stride, rng.int(0, w - 1), h);
      const dist = computeDist(t, grid, portal);
      for (let i = 0; i < 200; i++) {
        // Remove any cube that currently has a reachable neighbour, as a pickup would.
        const exposed: number[] = [];
        for (let c = 0; c < grid.length; c++) {
          if (grid[c] === EMPTY) continue;
          for (let k = 0; k < 4; k++) {
            const n = t.neighbors[c * 4 + k]!;
            if (n >= 0 && dist[n]! >= 0) {
              exposed.push(c);
              break;
            }
          }
        }
        if (exposed.length === 0) break;
        const cell = exposed[rng.int(0, exposed.length - 1)]!;
        grid[cell] = EMPTY;
        openCell(t, grid, dist, cell);
        expect(dist, `seed ${seed} step ${i}`).toEqual(computeDist(t, grid, portal));
      }
    }
  });

  it("returns newly reachable cells, including pocket cells and the opened cell", () => {
    const t = topologyFor(5, 3);
    const rows = ["XXXXX", "X.Y.X", "XXXXX"];
    const cells = rows.flatMap((r) =>
      [...r].map((ch) => (ch === "." ? EMPTY : ch === "X" ? 0 : 1)),
    );
    const grid = padCells(5, 3, cells);
    const dist = computeDist(t, grid, at(t.stride, 2, 3));
    const gate = at(t.stride, 1, 0);
    grid[gate] = EMPTY;
    const fresh = openCell(t, grid, dist, gate);
    expect(fresh).toContain(gate);
    expect(fresh).toContain(at(t.stride, 1, 1)); // the pocket joined
    expect(fresh).not.toContain(at(t.stride, 3, 1)); // the other pocket is still sealed
  });
});

describe("canonical descent", () => {
  it("builds the route from the portal by stepping to the first smaller-distance neighbour", () => {
    const t = topologyFor(3, 1);
    const grid = padCells(3, 1, [0, 0, 0]);
    const portal = at(t.stride, 1, 1);
    const dist = computeDist(t, grid, portal);
    // Standing at (0,1): route is portal, (0,1).
    expect(routeTo(t, dist, at(t.stride, 0, 1))).toEqual([portal, at(t.stride, 0, 1)]);
    // The portal itself is a route of one cell.
    expect(routeTo(t, dist, portal)).toEqual([portal]);
  });

  it("prefers up, then left, then right, then down among equal-distance predecessors", () => {
    const t = topologyFor(3, 3);
    const grid = padCells(3, 3, new Array(9).fill(EMPTY));
    const portal = at(t.stride, 1, 3);
    const dist = computeDist(t, grid, portal);
    // From (0,2) (d = 2) both (0,3) [down] and (1,2) [right] have d = 1: right wins over down.
    const route = routeTo(t, dist, at(t.stride, 0, 2));
    expect(route[1]).toBe(at(t.stride, 1, 2));
  });
});
