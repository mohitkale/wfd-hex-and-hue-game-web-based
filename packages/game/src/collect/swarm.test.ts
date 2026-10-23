import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { DEV_LEVELS } from "./levels";
import { CellSpreader, MAX_DRIFT, drift, hover, popDuration, unit } from "./swarm";

describe("swarm variation is deterministic and bounded", () => {
  it("unit() is stable, in [0, 1) and spreads evenly", () => {
    expect(unit(5, 1)).toBe(unit(5, 1));
    expect(unit(5, 1)).not.toBe(unit(5, 2));
    expect(unit(5, 1)).not.toBe(unit(6, 1));
    let sum = 0;
    const buckets = new Array<number>(10).fill(0);
    for (let id = 0; id < 5000; id++) {
      const u = unit(id, 3);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      sum += u;
      buckets[Math.floor(u * 10)]!++;
    }
    expect(sum / 5000).toBeGreaterThan(0.47);
    expect(sum / 5000).toBeLessThan(0.53);
    for (const b of buckets) expect(b).toBeGreaterThan(400); // no empty or hugely over-full bucket
  });

  it("each familiar's drift, hover and pop timing are fixed for its life and within limits", () => {
    for (let id = 0; id < 200; id++) {
      const d = drift(id);
      expect(drift(id)).toEqual(d);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(MAX_DRIFT);
      expect(Math.abs(d.y)).toBeLessThanOrEqual(MAX_DRIFT);
      const h = hover(id);
      expect(h.rate).toBeGreaterThanOrEqual(0.85);
      expect(h.rate).toBeLessThanOrEqual(1.15);
      expect(popDuration(id)).toBeGreaterThanOrEqual(120);
      expect(popDuration(id)).toBeLessThanOrEqual(170);
    }
    // Neighbouring ids do not move in lockstep.
    const distinct = new Set(Array.from({ length: 36 }, (_, id) => hover(id).phase.toFixed(3)));
    expect(distinct.size).toBe(36);
  });
});

describe("CellSpreader", () => {
  const run = (cells: [number, number][], spread = 0.28) => {
    const s = new CellSpreader(spread);
    s.begin();
    for (const [id, cell] of cells) s.add(id, cell);
    s.finish();
    return s;
  };

  it("leaves a lone familiar centred and fans a crowd out evenly, left to right by id", () => {
    const s = run([
      [0, 10],
      [1, 20],
      [2, 20],
      [3, 20],
      [4, 30],
      [5, 20],
    ]);
    expect(s.offset(0)).toBe(0);
    expect(s.offset(4)).toBe(0);
    const crowd = [1, 2, 3, 5].map((id) => s.offset(id));
    expect(crowd[0]).toBeCloseTo(-0.28);
    expect(crowd[3]).toBeCloseTo(0.28);
    expect([...crowd].sort((a, b) => a - b)).toEqual(crowd); // ordered by id
    expect(new Set(crowd).size).toBe(4);
    expect(s.offset(999)).toBe(0);
  });

  it("is reusable frame after frame (no state leaks between frames)", () => {
    const s = new CellSpreader();
    s.begin();
    s.add(1, 5);
    s.add(2, 5);
    s.finish();
    expect(s.offset(1)).not.toBe(0);
    s.begin();
    s.add(1, 5);
    s.add(2, 6);
    s.finish();
    expect(s.offset(1)).toBe(0);
    expect(s.offset(2)).toBe(0);
  });
});

describe("review-build levels (including the stress levels)", () => {
  it("every dev level is valid and has a legal first move", () => {
    for (const [name, make] of Object.entries(DEV_LEVELS)) {
      const level = make();
      expect(collect.validateCollectLevel(level), name).toEqual([]);
      expect(collect.legalActions(collect.createCollectState(level)).length, name).toBeGreaterThan(
        0,
      );
    }
  });

  it("the big level is the 40×40 worst case: 1,600 cubes, 36 familiars at once", () => {
    const level = DEV_LEVELS.big!();
    expect(level.width * level.height).toBe(1600);
    expect(level.cells.filter((c) => c >= 0)).toHaveLength(1600);
    expect(level.squad * level.fieldCap).toBe(36);
    expect(level.width).toBeLessThanOrEqual(collect.COLLECT_LIMITS.maxSize);
  });

  it("the stripe levels can always be cleared (no colour is ever hidden): a full headless solve wins", () => {
    const level = DEV_LEVELS.swarm!();
    const s = collect.createCollectState(level);
    for (let guard = 0; guard < 100 && s.status === "playing"; guard++) {
      const legal = collect.legalActions(s);
      if (legal.length === 0) break;
      collect.apply(s, legal[0]!);
      collect.runUntilSettled(s);
    }
    expect(s.status).toBe("won");
  });
});
