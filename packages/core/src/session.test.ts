import { describe, expect, it } from "vitest";
import type { Level, WispSpec } from "./level";
import { createRng } from "./rng";
import { GameSession, type SessionEvent } from "./session";

const col0 = { kind: "column", index: 0 } as const;
const col1 = { kind: "column", index: 1 } as const;
const slot0 = { kind: "slot", index: 0 } as const;

/** 3×3 with a color-0 center hidden behind a color-1 ring (lap length 16). */
function hiddenCenter(columns: WispSpec[][], slots = 5): Level {
  return {
    id: "t",
    name: "t",
    width: 3,
    height: 3,
    palette: ["#aa66ff", "#ffd966"],
    cells: [1, 1, 1, 1, 0, 1, 1, 1, 1],
    columns,
    slots,
    trackCap: 5,
  };
}

const ringFirst = () =>
  new GameSession(hiddenCenter([[{ color: 1, charge: 8 }], [{ color: 0, charge: 1 }]]));
const centerFirst = (slots = 5) =>
  new GameSession(hiddenCenter([[{ color: 0, charge: 1 }], [{ color: 1, charge: 8 }]], slots));

function tickUntilIdle(s: GameSession, max = 1000): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (let i = 0; i < max && s.state.status === "playing"; i++) {
    events.push(...s.tick());
    if (s.state.track.length === 0 && s.pending.length === 0) break;
  }
  return events;
}

describe("tap", () => {
  it("launches immediately when the entry is free", () => {
    const s = ringFirst();
    expect(s.tap(col0)).toEqual([
      { type: "queued", wispId: 0 },
      { type: "launched", wispId: 0, from: col0 },
    ]);
    expect(s.pending).toEqual([]);
    expect(s.state.track).toHaveLength(1);
  });

  it("queues a tap while the entry is busy and launches it on the next tick", () => {
    const s = ringFirst();
    s.tap(col0);
    expect(s.tap(col1)).toEqual([{ type: "queued", wispId: 1 }]);
    expect(s.pending).toEqual([1]);
    const events = s.tick();
    expect(events.at(-1)).toEqual({ type: "launched", wispId: 1, from: col1 });
    expect(s.pending).toEqual([]);
  });

  it("a second tap on the same column sends the next wisp in it", () => {
    const s = new GameSession(
      hiddenCenter([
        [
          { color: 1, charge: 4 },
          { color: 1, charge: 4 },
        ],
        [{ color: 0, charge: 1 }],
      ]),
    );
    s.tap(col0);
    s.tap(col0);
    expect(s.pending).toEqual([1]);
    expect(s.tapTarget(col0)).toBeNull();
    s.tick();
    expect(s.state.track.map((w) => w.id)).toEqual([0, 1]);
  });

  it("ignores taps on empty sources and slot wisps already queued", () => {
    const s = centerFirst();
    expect(s.tap(slot0)).toEqual([]);
    s.tap(col0);
    tickUntilIdle(s); // center wisp parks in slot 0
    expect(s.state.slots[0]?.id).toBe(0);
    s.tap(col1); // ring wisp launches
    expect(s.tap(slot0)).toEqual([{ type: "queued", wispId: 0 }]);
    expect(s.tap(slot0)).toEqual([]);
  });

  it("does nothing once the game is over", () => {
    const s = ringFirst();
    s.tap(col0);
    tickUntilIdle(s);
    s.tap(col1);
    tickUntilIdle(s);
    expect(s.state.status).toBe("won");
    expect(s.tap(col0)).toEqual([]);
    expect(s.tick()).toEqual([]);
  });
});

describe("track cap", () => {
  it("holds queued wisps while the track is full and launches when one leaves", () => {
    const lvl = hiddenCenter([[{ color: 0, charge: 1 }], [{ color: 1, charge: 8 }]]);
    const s = new GameSession({ ...lvl, trackCap: 1 });
    s.tap(col0);
    s.tick();
    s.tap(col1);
    expect(s.pending).toEqual([1]);
    for (let i = 0; i < 14; i++) s.tick();
    expect(s.pending).toEqual([1]); // still blocked: wisp 0 is on its lap
    const events = s.tick(); // wisp 0 parks, freeing the track
    expect(events.map((e) => e.type)).toEqual(["parked", "launched"]);
    expect(s.pending).toEqual([]);
  });
});

describe("full play-throughs", () => {
  it("wins by clearing the ring and then relaunching the parked center wisp", () => {
    const s = centerFirst();
    s.tap(col0);
    expect(tickUntilIdle(s).at(-1)).toEqual({ type: "parked", wispId: 0, slot: 0 });
    s.tap(col1);
    tickUntilIdle(s);
    s.tap(slot0);
    const events = tickUntilIdle(s);
    expect(events.slice(-3).map((e) => e.type)).toEqual(["collected", "portal", "won"]);
  });

  it("loses when a lap ends with no free slot and clears the queue", () => {
    const s = new GameSession(
      hiddenCenter(
        [
          [
            { color: 0, charge: 1 },
            { color: 1, charge: 8 },
          ],
          [{ color: 0, charge: 1 }],
        ],
        1,
      ),
    );
    s.tap(col0);
    tickUntilIdle(s);
    s.tap(col1);
    for (let i = 0; i < 5; i++) s.tick();
    s.tap(col0); // ring wisp launches 5 cells behind; it cannot open the center in time
    const events = tickUntilIdle(s);
    expect(events.some((e) => e.type === "lost")).toBe(true);
    expect(s.state.status).toBe("lost");
    expect(s.pending).toEqual([]);
  });

  it("replays identically from the same inputs", () => {
    const run = () => {
      const s = centerFirst();
      const log: SessionEvent[] = [];
      s.subscribe((e) => log.push(e));
      s.tap(col0);
      s.tick();
      s.tap(col1);
      tickUntilIdle(s);
      s.tap(slot0);
      tickUntilIdle(s);
      return JSON.stringify(log);
    };
    expect(run()).toEqual(run());
  });
});

describe("undo and restart", () => {
  it("reverts to just before the last tap, including the queue", () => {
    const s = ringFirst();
    s.tap(col0);
    s.tick();
    s.tick();
    const before = JSON.stringify(s.state);
    s.tap(col1);
    s.tick(); // not enough to win (center not yet exposed)
    expect(s.state.status).toBe("playing");
    expect(s.undo()).toBe(true);
    expect(JSON.stringify(s.state)).toEqual(before);
    expect(s.pending).toEqual([]);
  });

  it("restores a non-empty queue and keeps the queued wisp in its column", () => {
    const s = ringFirst();
    s.tap(col0);
    s.tap(col1); // queued: entry busy
    expect(s.pending).toEqual([1]);
    s.tap(slot0); // no-op: empty slot, no snapshot
    s.tick(); // wisp 1 launches
    expect(s.state.columns[1]).toEqual([]);
    expect(s.undo()).toBe(true); // back to just before tapping col1
    expect(s.pending).toEqual([]);
    expect(s.state.columns[1]).toHaveLength(1);
    expect(s.undo()).toBe(true); // back to the start
    expect(s.state.track).toEqual([]);
    expect(s.canUndo).toBe(false);
  });

  it("restores the queue exactly when undoing a tap made while others were queued", () => {
    const s = new GameSession(
      hiddenCenter([
        [
          { color: 1, charge: 4 },
          { color: 1, charge: 4 },
        ],
        [{ color: 0, charge: 1 }],
      ]),
    );
    s.tap(col0); // wisp 0 launches
    s.tap(col0); // wisp 1 queued
    s.tap(col1); // wisp 2 queued
    expect(s.pending).toEqual([1, 2]);
    s.undo();
    expect(s.pending).toEqual([1]);
    expect(s.state.columns[1]?.[0]?.id).toBe(2);
  });

  it("undo, play on, undo again never aliases snapshots", () => {
    const s = ringFirst();
    s.tap(col0);
    tickUntilIdle(s);
    const afterRing = JSON.stringify(s.state);
    s.tap(col1);
    s.tick();
    s.undo();
    expect(JSON.stringify(s.state)).toEqual(afterRing);
    s.tap(col1);
    s.tick();
    expect(s.state.status).toBe("playing");
    s.undo();
    expect(JSON.stringify(s.state)).toEqual(afterRing);
  });

  it("refuses undo after a win", () => {
    const s = ringFirst();
    s.tap(col0);
    tickUntilIdle(s);
    s.tap(col1);
    tickUntilIdle(s);
    expect(s.state.status).toBe("won");
    expect(s.canUndo).toBe(false);
    expect(s.undo()).toBe(false);
  });

  it("can undo out of a lost game", () => {
    const s = new GameSession(
      hiddenCenter([[{ color: 0, charge: 1 }], [{ color: 0, charge: 1 }]], 1),
    );
    s.tap(col0);
    tickUntilIdle(s);
    s.tap(col1);
    tickUntilIdle(s);
    expect(s.state.status).toBe("lost");
    s.undo();
    expect(s.state.status).toBe("playing");
    expect(s.state.columns[1]).toHaveLength(1);
  });

  it("keeps at most maxUndo snapshots", () => {
    const s = new GameSession(
      hiddenCenter([
        Array.from({ length: 8 }, () => ({ color: 1, charge: 1 })),
        [{ color: 0, charge: 1 }],
      ]),
      3,
    );
    for (let i = 0; i < 6; i++) {
      s.tap(col0);
      tickUntilIdle(s);
    }
    let undos = 0;
    while (s.undo()) undos++;
    expect(undos).toBe(3);
  });

  it("restart resets state, queue and history and notifies listeners", () => {
    const s = ringFirst();
    const seen: string[] = [];
    s.subscribe((e) => seen.push(e.type));
    s.tap(col0);
    s.tap(col1);
    s.restart();
    expect(s.state.track).toEqual([]);
    expect(s.state.remaining).toBe(9);
    expect(s.pending).toEqual([]);
    expect(s.canUndo).toBe(false);
    expect(seen).toEqual(["queued", "launched", "queued", "restarted"]);
  });

  it("unsubscribe stops notifications", () => {
    const s = ringFirst();
    const seen: string[] = [];
    const off = s.subscribe((e) => seen.push(e.type));
    off();
    s.tap(col0);
    expect(seen).toEqual([]);
  });
});

describe("booster actions", () => {
  it("wand collects, emits, and is undoable", () => {
    const s = ringFirst();
    const seen: string[] = [];
    s.subscribe((e) => seen.push(e.type));
    expect(s.wand(0)).toBe(false); // center not exposed
    expect(s.wand(1)).toBe(true);
    expect(seen).toEqual(["wand"]);
    expect(s.state.remaining).toBe(1);
    s.undo();
    expect(s.state.remaining).toBe(9);
  });

  it("extra slot revives a lost game, and the player can then win", () => {
    const s = new GameSession(
      hiddenCenter(
        [[{ color: 0, charge: 1 }], [{ color: 0, charge: 1 }], [{ color: 1, charge: 8 }]],
        1,
      ),
    );
    s.tap(col0);
    tickUntilIdle(s);
    s.tap(col1);
    tickUntilIdle(s);
    expect(s.state.status).toBe("lost");
    expect(s.extraSlot()).toBe(true);
    expect(s.state.status).toBe("playing");
    s.tap({ kind: "column", index: 2 });
    tickUntilIdle(s);
    s.tap(slot0);
    tickUntilIdle(s);
    expect(s.state.status).toBe("won");
  });

  it("shuffle re-deals columns, clears the queue and is undoable", () => {
    const s = new GameSession(
      hiddenCenter([
        [
          { color: 1, charge: 4 },
          { color: 0, charge: 1 },
        ],
        [{ color: 1, charge: 4 }],
      ]),
    );
    s.tap(col0);
    s.tap(col1); // queued
    const before = JSON.stringify(s.state.columns);
    expect(s.shuffle(createRng(3))).toBe(true);
    expect(s.pending).toEqual([]);
    expect(JSON.stringify(s.state.columns)).not.toEqual(before);
    s.undo();
    expect(JSON.stringify(s.state.columns)).toEqual(before);
  });
});
