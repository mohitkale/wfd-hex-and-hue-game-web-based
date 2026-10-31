import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { DEV_LEVELS, levelFromSearch } from "./levels";
import { moonlitHat } from "./slice";
import { boardShape, redeal, TRAY_SPAWN_GAP, TRAY_SQUAD, withSharedTrays } from "./trayRules";

describe("the board plays with every tray working (M15.13)", () => {
  it("sizes trays and box columns by the picture and its boxes: 3 or 4 and 3 when small, 5 and 4 when large", () => {
    expect(boardShape(196, 5)).toEqual({ trays: 3, columns: 3 });
    expect(boardShape(312, 9)).toEqual({ trays: 4, columns: 3 });
    expect(boardShape(575, 12)).toEqual({ trays: 5, columns: 4 });
    // Never more trays or columns than boxes (the two-box tutorial shows two).
    expect(boardShape(20, 2)).toEqual({ trays: 2, columns: 2 });
    for (const id of Object.keys(DEV_LEVELS).filter((k) => k.startsWith("art-"))) {
      const l = DEV_LEVELS[id]!();
      const cubes = l.cells.filter((c) => c >= 0).length;
      const boxes = l.columns.flat().length;
      expect(l.slots, id).toBe(boardShape(cubes, boxes).trays);
      expect(l.columns.length, id).toBe(boardShape(cubes, boxes).columns);
    }
  });

  it("redeals boxes front rows first, keeping every box once", () => {
    const g = (color: number, capacity: number) => ({ color, capacity });
    const cols = [
      [g(0, 1), g(1, 2), g(2, 3)],
      [g(3, 4), g(4, 5)],
      [g(5, 6), g(6, 7)],
    ];
    const out = redeal(cols, 4);
    expect(out.map((c) => c[0]!.color)).toEqual([0, 3, 5, 1]);
    expect(
      out
        .flat()
        .map((x) => x.color)
        .sort(),
    ).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("turns every tray into a working one", () => {
    const base = moonlitHat();
    const l = withSharedTrays(base);
    expect(l.sharedTrays).toBe(true);
    expect(l.slots).toBe(4);
    expect(l.fieldCap).toBe(l.slots);
    expect(l.squad).toBe(TRAY_SQUAD);
    expect(l.spawnGap).toBe(Math.max(1, Math.round(TRAY_SPAWN_GAP)));
    expect(collect.validateCollectLevel(l)).toEqual([]);
    expect(withSharedTrays(l)).toBe(l);
  });

  it("the slice, every art level and the tutorial load that way", () => {
    expect(levelFromSearch("").sharedTrays).toBe(true);
    for (const id of Object.keys(DEV_LEVELS).filter((k) => k.startsWith("art-")))
      expect(DEV_LEVELS[id]!().sharedTrays, id).toBe(true);
    expect(levelFromSearch("?level=tutorial-summon").sharedTrays).toBe(true);
  });

  it("the board's winning demo (its recorded line) wins on the board", async () => {
    const { demoLineFromSearch } = await import("./levels");
    const level = levelFromSearch("");
    const line = demoLineFromSearch("?demo=win", level)!;
    expect(collect.replayLine(level, line, true).state.status).toBe("won");
  });

  it("never ends with every slot full, however fast the player taps", () => {
    const s = new collect.CollectSession(levelFromSearch(""), undefined, undefined, true);
    for (let i = 0; i < 4000 && s.state.status === "playing"; i++) {
      if (i % 5 === 0) for (let c = 0; c < 3; c++) s.tap({ kind: "select", column: c });
      s.tick();
    }
    expect(s.state.lossReason).not.toBe("slotsFull");
  });
});

describe("the home screen's level line (M15.13)", () => {
  it("is the witch's journey: six chapters of four, easy to extreme, each opening after the one before", async () => {
    const { levelLine, lineStatus } = await import("./levels");
    const line = levelLine();
    expect(line).toHaveLength(24);
    for (const e of line) expect(DEV_LEVELS[e.key], e.key).toBeDefined();
    line.forEach((e, i) => {
      expect(e.chapter).toBe(Math.floor(i / 4) + 1);
      expect(e.tier).toBe(["easy", "medium", "hard", "extreme"][i % 4]);
      expect(e.challenge).toBe(i % 4 >= 2 ? e.tier : null);
    });
    expect(lineStatus(line, new Set())).toEqual(["open", ...line.slice(1).map(() => "locked")]);
    const after = lineStatus(line, new Set([line[0]!.id]));
    expect(after.slice(0, 3)).toEqual(["done", "open", "locked"]);
  });

  it("wax seals only on hard and extreme levels, never in the first two chapters (owner feedback)", async () => {
    const { JOURNEY } = await import("./journey");
    for (const e of JOURNEY) {
      const sealed = (e.make().seals?.length ?? 0) > 0;
      if (e.chapter < 3 || e.tier === "easy" || e.tier === "medium")
        expect(sealed, e.id).toBe(false);
    }
  });

  it("every box shows two digits at most, most of them in the 20s to 40s (owner rule)", async () => {
    const { JOURNEY, MAX_BOX } = await import("./journey");
    const all: number[] = [];
    for (const e of JOURNEY) {
      const sizes = e
        .make()
        .columns.flat()
        .map((g) => g.capacity);
      for (const n of sizes) expect(n, e.id).toBeLessThanOrEqual(MAX_BOX);
      all.push(...sizes);
    }
    const mid = all.filter((n) => n >= 20 && n < 50).length;
    expect(mid / all.length).toBeGreaterThan(0.5);
  });

  it("every journey picture fills its whole board: the art sits on a full canvas", async () => {
    const { JOURNEY } = await import("./journey");
    for (const e of JOURNEY) {
      const level = e.base();
      expect(
        level.cells.every((c) => c >= 0),
        e.id,
      ).toBe(true);
    }
  });

  it("every journey level keeps its board's trays: a hard level is not a level with fewer trays", async () => {
    const { JOURNEY } = await import("./journey");
    const { boardShape } = await import("./trayRules");
    for (const e of JOURNEY) {
      const level = e.make();
      const cubes = level.cells.filter((c) => c >= 0).length;
      const shape = boardShape(cubes, e.base().columns.flat().length);
      expect(level.slots, e.id).toBe(shape.trays);
      expect(level.columns.length, e.id).toBe(shape.columns);
    }
  });
});

describe("walking speed is the same on screen on every board (M15.13)", () => {
  it("smaller cells tick faster, so a familiar covers the same css px a second", async () => {
    const { ticksPerSecondFor, WALK_CSS_PER_SECOND } = await import("./tickClock");
    expect(ticksPerSecondFor(22) * 22).toBeCloseTo(WALK_CSS_PER_SECOND);
    expect(ticksPerSecondFor(10) * 10).toBeCloseTo(WALK_CSS_PER_SECOND);
    expect(ticksPerSecondFor(1)).toBe(36);
  });
});

describe("every level has the same pace at 1× (M15.13)", () => {
  it("the walk out of the tray and the gap between familiars take the same seconds on a narrow and a wide picture", async () => {
    const { ticksPerSecondFor } = await import("./tickClock");
    const seconds = (id: string) => {
      const l = DEV_LEVELS[id]!();
      // Cells fill the same width on screen, so a wider picture has proportionally smaller cells.
      const cellCss = 350 / (l.width + 2);
      const tps = ticksPerSecondFor(cellCss);
      return { gate: l.gate! / tps, spawn: l.spawnGap / tps };
    };
    const narrow = seconds("slice");
    const wide = seconds("art-witchs-cauldron");
    expect(Math.abs(narrow.gate - wide.gate)).toBeLessThan(0.2);
    expect(Math.abs(narrow.spawn - wide.spawn)).toBeLessThan(0.1);
  });
});
