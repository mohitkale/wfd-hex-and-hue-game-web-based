import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import {
  cellCenter,
  computeCollectLayout,
  spriteScaleForCell,
  type CollectLayoutInput,
} from "./collectLayout";
import { createRng } from "@hexhue/core";
import { TickClock } from "./tickClock";
import { VisualModel, frameFor, lerpPoint } from "./visuals";

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

/** Fixture A (3×1) and B (5×4) as plain levels so the tests need no test helpers from core. */
const levelA = (): collect.CollectLevel => ({
  id: "a",
  name: "a",
  width: 3,
  height: 1,
  palette: ["#e24a4a"],
  cells: [0, 0, 0],
  columns: [[{ color: 0, capacity: 2 }], [{ color: 0, capacity: 1 }]],
  slots: 2,
  squad: 1,
  spawnGap: 1,
  fieldCap: 3,
});

const levelB = (): collect.CollectLevel => {
  const rows = ["BBBBB", "BRBGB", "BBBBB", "BRBGB"];
  const colors = "BRG";
  return {
    id: "b",
    name: "b",
    width: 5,
    height: 4,
    palette: ["#4a6be2", "#e24a4a", "#4ae26b"],
    cells: rows.flatMap((r) => [...r].map((c) => colors.indexOf(c))),
    columns: [
      [{ color: 1, capacity: 2 }],
      [{ color: 2, capacity: 2 }],
      [{ color: 0, capacity: 16 }],
    ],
    slots: 1,
    squad: 3,
    spawnGap: 2,
    fieldCap: 3,
  };
};

describe("collect layout", () => {
  const devices: [string, number, number, number][] = [
    ["iPhone SE 1st gen", 320, 568, 2],
    ["iPhone SE 2nd gen", 375, 667, 2],
    ["iPhone 15", 393, 852, 3],
    ["Pixel 7", 412, 915, 2.625],
    ["iPad", 768, 1024, 2],
    ["Desktop", 1440, 900, 1],
  ];
  const input = (
    w: number,
    h: number,
    dpr: number,
    over: Partial<CollectLayoutInput> = {},
  ): CollectLayoutInput => ({
    width: Math.round(w * dpr),
    height: Math.round(h * dpr),
    dpr,
    insets: NO_INSETS,
    boardWidth: 22,
    boardHeight: 22,
    slots: 3,
    columns: 4,
    fieldCap: 3,
    portalX: 10,
    ...over,
  });

  it.each(devices)("%s: everything fits inside the frame without overlap", (_name, w, h, dpr) => {
    const l = computeCollectLayout(input(w, h, dpr));
    const inside = (r: { x: number; y: number; w: number; h: number }) => {
      expect(r.x).toBeGreaterThanOrEqual(l.frame.x);
      expect(r.y).toBeGreaterThanOrEqual(l.frame.y);
      expect(r.x + r.w).toBeLessThanOrEqual(l.frame.x + l.frame.w);
      expect(r.y + r.h).toBeLessThanOrEqual(l.frame.y + l.frame.h);
    };
    [l.hud, l.boardRect, ...l.field, ...l.slots, ...l.columns].forEach(inside);
    // Vertical order: hud, board, field strip, slots, columns.
    expect(l.boardRect.y).toBeGreaterThanOrEqual(l.hud.y + l.hud.h);
    expect(l.boardRect.y + l.boardRect.h).toBeLessThanOrEqual(l.field[0]!.y);
    expect(l.field[0]!.y + l.field[0]!.h).toBeLessThanOrEqual(l.slots[0]!.y);
    expect(l.slots[0]!.y + l.slots[0]!.h).toBeLessThanOrEqual(l.columns[0]!.y);
    // Tiles in a row never overlap.
    for (const rowOfRects of [l.field, l.slots, l.columns]) {
      for (let i = 1; i < rowOfRects.length; i++) {
        expect(rowOfRects[i]!.x).toBeGreaterThanOrEqual(
          rowOfRects[i - 1]!.x + rowOfRects[i - 1]!.w,
        );
      }
    }
    expect(l.boardRect.w).toBe(24 * l.cell);
    expect(l.cell).toBeGreaterThanOrEqual(Math.floor(9 * dpr)); // a 22×22 board stays usable
  });

  it.each(devices)("%s: the booster tray sits between the HUD and the board", (_n, w, h, dpr) => {
    const none = computeCollectLayout(input(w, h, dpr));
    const l = computeCollectLayout(input(w, h, dpr, { tray: true }));
    expect(none.tray.h).toBe(0);
    expect(l.tray.h).toBeGreaterThan(0);
    expect(l.tray.y).toBe(l.hud.y + l.hud.h);
    expect(l.boardRect.y).toBeGreaterThanOrEqual(l.tray.y + l.tray.h);
    expect(l.tray.x).toBeGreaterThanOrEqual(l.frame.x);
    expect(l.tray.x + l.tray.w).toBeLessThanOrEqual(l.frame.x + l.frame.w);
    // The tray costs the board at most a little: a 22×22 board stays usable with it.
    expect(l.cell).toBeGreaterThanOrEqual(Math.floor(8 * dpr));
    expect(l.cell).toBeLessThanOrEqual(none.cell);
  });

  it("respects safe-area insets and a thumb-sized column zone", () => {
    const l = computeCollectLayout(
      input(393, 852, 3, { insets: { top: 141, right: 0, bottom: 102, left: 0 } }),
    );
    expect(l.frame.y).toBe(141);
    expect(l.frame.y + l.frame.h).toBe(Math.round(852 * 3) - 102);
    for (const c of l.columns) expect(c.w / 3).toBeGreaterThanOrEqual(44);
  });

  it("centres the board and maps padded cells to screen positions", () => {
    const l = computeCollectLayout(
      input(375, 667, 2, { boardWidth: 3, boardHeight: 1, columns: 2, portalX: 1 }),
    );
    const portalIdx = (1 + 1) * 5 + 2; // (x=1, y=height) in padded coordinates
    const p = cellCenter(l, portalIdx);
    expect(p.x).toBeCloseTo(l.boardRect.x + 2.5 * l.cell);
    expect(p.y).toBeCloseTo(l.boardRect.y + 2.5 * l.cell);
    // Neighbouring cells are exactly one cell apart.
    expect(cellCenter(l, portalIdx + 1).x - p.x).toBeCloseTo(l.cell);
    expect(cellCenter(l, portalIdx + 5).y - p.y).toBeCloseTo(l.cell);
    expect(
      Math.abs(l.boardRect.x + l.boardRect.w / 2 - (l.frame.x + l.frame.w / 2)),
    ).toBeLessThanOrEqual(1);
  });

  it("scales the sprite in whole numbers with the cell size", () => {
    expect([8, 16, 28, 40, 80].map((c) => spriteScaleForCell(c))).toEqual([1, 2, 3, 4, 6]);
  });
});

describe("tick clock", () => {
  it("defaults to 24 ticks a second", () => {
    expect(new TickClock().ticksPerSecond).toBe(24);
    expect(new TickClock().tickMs).toBeCloseTo(41.67, 1);
  });

  it("runs one tick per tick-length and keeps the remainder", () => {
    const c = new TickClock(10);
    expect(c.advance(50, 1)).toBe(0);
    expect(c.alpha).toBeCloseTo(0.5);
    expect(c.advance(60, 1)).toBe(1);
    expect(c.alpha).toBeCloseTo(0.1);
  });

  it("2× runs exactly twice the ticks over the same time (outcomes never change, only pace)", () => {
    const count = (speed: number) => {
      const c = new TickClock(10);
      let ticks = 0;
      for (let i = 0; i < 600; i++) ticks += c.advance(16.7, speed);
      return ticks;
    };
    const one = count(1);
    const two = count(2);
    expect(two).toBeGreaterThanOrEqual(2 * one - 1);
    expect(two).toBeLessThanOrEqual(2 * one + 1);
  });

  it("caps ticks per frame and drops the backlog instead of snowballing", () => {
    const c = new TickClock(10, 4);
    expect(c.advance(10_000, 1)).toBe(4);
    expect(c.alpha).toBeLessThan(1);
    // The next normal frame is normal again.
    expect(c.advance(16, 1)).toBeLessThanOrEqual(1);
  });

  it("drain drops due ticks but keeps the position inside the tick (no snap-back)", () => {
    const c = new TickClock(10);
    c.advance(30, 1);
    const before = c.alpha;
    c.drain();
    expect(c.alpha).toBeCloseTo(before);
    c.advance(1_000, 1); // a long idle period nobody ticked
    c.drain();
    expect(c.alpha).toBeLessThan(1);
    expect(c.alpha).toBeGreaterThan(0.9); // the next action starts within a tick
    expect(c.advance(5, 1)).toBe(1);
  });

  it("ignores zero or negative frame time and can be reset", () => {
    const c = new TickClock();
    expect(c.advance(0, 1)).toBe(0);
    expect(c.advance(-5, 1)).toBe(0);
    c.advance(60, 1);
    c.reset();
    expect(c.alpha).toBe(0);
  });
});

describe("visual model", () => {
  /** Plays a level with a session and mirrors it in a model, checking every tick. */
  function play(level: collect.CollectLevel, actions: collect.Action[]) {
    const session = new collect.CollectSession(level);
    const portal = session.state.params.portal;
    const model = new VisualModel(portal, (g) => session.state.groups[g]!.color);
    const log: { tick: number; events: collect.CollectEvent[] }[] = [];
    session.subscribe((b) => {
      for (const e of b.events) model.apply(e, b.tick);
      log.push(b);
    });
    for (const a of actions) {
      expect(session.tap(a).ok).toBe(true);
      for (let i = 0; i < 5_000 && session.tick() !== null; i++) {
        // The model must always agree with a fresh rebuild from the state.
        const rebuilt = new VisualModel(portal, (g) => session.state.groups[g]!.color);
        rebuilt.resync(session.state as collect.CollectState);
        // Familiars that retired this tick are still being animated out of the portal.
        const live = [...model.familiars.values()].filter((v) => v.mode !== "retiring");
        expect(live.map((v) => v.id).sort()).toEqual([...rebuilt.familiars.keys()].sort());
        for (const [id, v] of model.familiars) {
          if (v.mode === "retiring") continue;
          const r = rebuilt.familiars.get(id)!;
          const at = `familiar ${id} at tick ${session.state.tick}`;
          // Where it stands, and whether it holds a cube, must always agree with the engine.
          expect(v.to, at).toBe(r.to);
          expect(v.carried === null, at).toBe(r.carried === null);
          // A move in progress must agree on its direction and both ends. (Pickup, delivery and
          // idle are one-tick poses that a snapshot cannot tell apart from the neighbouring pose.)
          if (v.mode === "walk" || v.mode === "carry") {
            expect(r.mode, at).toBe(v.mode);
            expect(v.from, at).toBe(r.from);
          }
        }
        for (const [id, v] of [...model.familiars]) if (v.mode === "retiring") model.remove(id);
      }
    }
    return { session, model, log, portal };
  }

  it("fixture A: spawns at the portal, walks, picks up, carries home, delivers, retires", () => {
    const { session, log, portal } = play(levelA(), [{ kind: "select", column: 0 }]);
    expect(session.state.groups[0]!.status).toBe("completed");
    const types = log.flatMap((b) => b.events.map((e) => e.type));
    expect(types.filter((t) => t === "cubePickedUp")).toHaveLength(2);
    expect(types.filter((t) => t === "cubeDelivered")).toHaveLength(2);
    expect(types).toContain("familiarRetired");
    expect(portal).toBe(session.state.params.portal);
  });

  it("every familiar always moves one cell at a time and carries a cube exactly between pickup and delivery", () => {
    const { log } = play(levelB(), [
      { kind: "select", column: 2 },
      { kind: "select", column: 0 },
      { kind: "select", column: 1 },
    ]);
    const carried = new Map<number, boolean>();
    for (const b of log) {
      for (const e of b.events) {
        if (e.type === "cubePickedUp") carried.set(e.familiar, true);
        if (e.type === "cubeDelivered") carried.set(e.familiar, false);
        if (e.type === "familiarMoved") {
          expect(e.carrying, `familiar ${e.familiar} at tick ${b.tick}`).toBe(
            carried.get(e.familiar) === true,
          );
        }
      }
    }
  });

  it("positions interpolate between the two cells of the move", () => {
    const a = { x: 10, y: 20 };
    const b = { x: 30, y: 60 };
    expect(lerpPoint(a, b, 0)).toEqual(a);
    expect(lerpPoint(a, b, 1)).toEqual(b);
    expect(lerpPoint(a, b, 0.5)).toEqual({ x: 20, y: 40 });
    expect(lerpPoint(a, b, 2)).toEqual(b); // clamped
    expect(lerpPoint(a, b, -1)).toEqual(a);
  });

  it("chooses walking, carrying, pickup and delivery frames and alternates steps with the tick", () => {
    const v = (mode: "walk" | "carry" | "pickup" | "deliver" | "idle" | "retiring") => ({
      id: 0,
      group: 0,
      colorIndex: 0,
      mode,
      from: 0,
      to: 1,
      carried: null,
      delivered: null,
      target: null,
      since: 0,
    });
    expect(frameFor(v("walk"), 0)).toBe("walk0");
    expect(frameFor(v("walk"), 1)).toBe("walk1");
    expect(frameFor(v("carry"), 0)).toBe("carry0");
    expect(frameFor(v("carry"), 1)).toBe("carry1");
    expect(frameFor(v("pickup"), 5)).toBe("pickup");
    expect(frameFor(v("deliver"), 5)).toBe("deliver");
    expect(frameFor(v("idle"), 0)).toBe("idle0");
    expect(frameFor(v("retiring"), 1)).toBe("idle1");
  });
});

describe("visual model stays consistent through mid-flight taps, undo and restart", () => {
  it("matches a rebuild from the state at every tick of random sessions", () => {
    let ticks = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const rng = createRng(seed);
      const session = new collect.CollectSession(levelB());
      const portal = session.state.params.portal;
      const groupColor = (g: number) => session.state.groups[g]!.color;
      let model = new VisualModel(portal, groupColor);
      session.subscribe((b) => {
        for (const e of b.events) model.apply(e, b.tick);
      });
      // The scene rebuilds its model from the state after an undo or restart; do the same.
      session.onReplace(() => {
        model = new VisualModel(portal, groupColor);
        model.resync(session.state as collect.CollectState);
      });
      for (let i = 0; i < 1_500; i++) {
        const r = rng.next();
        if (r < 0.2) {
          const legal = collect.legalActions(session.state as collect.CollectState);
          if (legal.length > 0) session.tap(legal[rng.int(0, legal.length - 1)]!);
        } else if (r < 0.215) session.undo();
        else if (r < 0.22) session.restart();
        session.tick();
        ticks++;
        const rebuilt = new VisualModel(portal, groupColor);
        rebuilt.resync(session.state as collect.CollectState);
        const live = [...model.familiars.values()].filter((v) => v.mode !== "retiring");
        expect(live.map((v) => v.id).sort(), `seed ${seed} step ${i}`).toEqual(
          [...rebuilt.familiars.keys()].sort(),
        );
        for (const v of live) {
          const w = rebuilt.familiars.get(v.id)!;
          expect(v.to).toBe(w.to);
          expect(v.carried === null).toBe(w.carried === null);
        }
        for (const [id, v] of [...model.familiars]) if (v.mode === "retiring") model.remove(id);
      }
    }
    expect(ticks).toBe(45_000);
  });
});

describe("review-build level and demo wiring", () => {
  it("opens the vertical slice by default and still honours ?level=", async () => {
    const { levelFromSearch } = await import("./levels");
    expect(levelFromSearch("?engine=v2").id).toBe("slice-moonlit-hat");
    expect(levelFromSearch("?engine=v2&level=parking").id).toBe("dev-parking");
    expect(levelFromSearch("?engine=v2&level=nope").id).toBe("slice-moonlit-hat");
  });

  it("?demo= picks the recorded line it names, and only on the slice level", async () => {
    const { demoLineFromSearch, levelFromSearch } = await import("./levels");
    const { LOSE_LINES, WIN_LINE } = await import("./slice");
    const slice = levelFromSearch("");
    expect(demoLineFromSearch("?demo=win", slice)).toBe(WIN_LINE);
    expect(demoLineFromSearch("?demo=slots", slice)).toBe(LOSE_LINES.slots);
    expect(demoLineFromSearch("?demo=lose", slice)).toBe(LOSE_LINES.slots);
    expect(demoLineFromSearch("?demo=deadlock", slice)).toBe(LOSE_LINES.deadlock);
    expect(demoLineFromSearch("?demo=other", slice)).toBeNull();
    expect(demoLineFromSearch("", slice)).toBeNull();
    expect(demoLineFromSearch("?demo=win", levelFromSearch("?level=parking"))).toBeNull();
  });
});
