import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { paintSeal, tonesFor, type TilePainter } from "./cubePaint";
import { DEV_LEVELS, levelFromSearch, sealsIntro } from "./levels";
import { sealMap } from "./sealView";

/** M13.4: the wax-seal tutorial level and how seals are drawn. */

describe("the wax-seal tutorial level", () => {
  it("is a valid, solver-verified level reachable as ?level=seals", () => {
    const level = sealsIntro();
    expect(collect.validateCollectLevel(level)).toEqual([]);
    expect(DEV_LEVELS["seals"]).toBe(sealsIntro);
    expect(levelFromSearch("?level=seals").id).toBe("dev-seals-intro");
    const result = collect.solve(level, 50_000);
    expect(result.status).toBe("solved");
    expect(collect.replayLine(level, result.line!).state.status).toBe("won");
  });

  it("teaches in one tap: gold is refused as sealed, violet is open, and violet unseals the gold", () => {
    const level = sealsIntro();
    const s = collect.createCollectState(level);
    expect(collect.explain(s, { kind: "select", column: 0 })).toBe("sealed");
    expect(collect.explain(s, { kind: "select", column: 1 })).toBe("ok");
    collect.apply(s, { kind: "select", column: 1 });
    collect.runUntilSettled(s);
    expect(collect.explain(s, { kind: "select", column: 0 })).toBe("ok");
    collect.apply(s, { kind: "select", column: 0 });
    collect.runUntilSettled(s);
    expect(s.status).toBe("won");
  });
});

describe("drawing seals", () => {
  it("maps each sealed cube to its key colour, and drops them when the key group completes", () => {
    const s = collect.createCollectState(sealsIntro());
    const map = sealMap(s);
    expect(map.size).toBe(12);
    expect([...map.values()]).toEqual(new Array(12).fill(1));
    collect.apply(s, { kind: "select", column: 1 });
    collect.runUntilSettled(s);
    expect(sealMap(s).size).toBe(0);
  });

  it("paints a veil, a pale rim and the key colour's square inside the cube, never outside it", () => {
    const calls: [string, ...number[]][] = [];
    const painter: TilePainter = {
      fillStyle: (c, a) => calls.push(["fill", c, a ?? 1]),
      fillRect: (x, y, w, h) => calls.push(["rect", x, y, w, h]),
      fillRoundedRect: (x, y, w, h) => calls.push(["rect", x, y, w, h]),
    };
    for (const size of [5, 8, 20]) {
      calls.length = 0;
      paintSeal(painter, 10, 20, size, tonesFor("#b44ae2"));
      const rects = calls.filter((c) => c[0] === "rect") as [
        string,
        number,
        number,
        number,
        number,
      ][];
      expect(rects.length).toBeGreaterThanOrEqual(3);
      for (const [, x, y, w, h] of rects) {
        expect(x).toBeGreaterThanOrEqual(10);
        expect(y).toBeGreaterThanOrEqual(20);
        expect(x + w).toBeLessThanOrEqual(10 + size);
        expect(y + h).toBeLessThanOrEqual(20 + size);
      }
      // The first fill is the veil (translucent), the key colour is painted after the rim.
      expect(calls[0]).toEqual(["fill", 0x140b2e, 0.5]);
    }
  });
});
