import { describe, expect, it } from "vitest";
import { createState, launch, step } from "@hexhue/core";
import { worlds } from "./levels";
import { TICK_MS } from "./motion";
import {
  MIN_TIP_MS,
  TIPS,
  TipQueue,
  hintDelayMs,
  tipFor,
  tipLifetimeMs,
  tutorialDone,
  type TipId,
  type TipTrigger,
} from "./tips";

describe("tips", () => {
  it("shows each tip once", () => {
    expect(tipFor({ type: "start" }, [])).toBe("launch");
    expect(tipFor({ type: "start" }, ["launch"])).toBeNull();
    expect(tipFor({ type: "collected" }, [])).toBe("collect");
    expect(tipFor({ type: "portal" }, ["portal"])).toBeNull();
  });

  it("introduces boosters at the first level start after the tutorial", () => {
    expect(tipFor({ type: "start" }, ["launch"], true)).toBe("boosters");
    expect(tipFor({ type: "start" }, ["launch", "boosters"], true)).toBeNull();
  });

  it("explains the first park, then warns once when only one slot is left", () => {
    const park = (freeSlots: number, slots = 3): TipTrigger => ({
      type: "parked",
      freeSlots,
      slots,
    });
    expect(tipFor(park(1), [])).toBe("park");
    expect(tipFor(park(2), ["park"])).toBeNull();
    expect(tipFor(park(1), ["park"])).toBe("slotsTight");
    expect(tipFor(park(1), ["park", "slotsTight"])).toBeNull();
    // A one-slot board is always "one slot left": nothing useful to warn about.
    expect(tipFor(park(1, 1), ["park"])).toBeNull();
  });

  it("closes the tutorial on the first relaunch from a slot, after the park tip", () => {
    expect(tipFor({ type: "launched", fromSlot: true }, [])).toBeNull();
    expect(tipFor({ type: "launched", fromSlot: false }, ["park"])).toBeNull();
    expect(tipFor({ type: "launched", fromSlot: true }, ["park"])).toBe("relaunch");
  });

  it("explains the hint glow only after the tutorial (where the glow is the pointer)", () => {
    expect(tipFor({ type: "hint" }, [])).toBeNull();
    expect(tipFor({ type: "hint" }, ["relaunch"])).toBe("hint");
    expect(tipFor({ type: "hint" }, [], true)).toBe("hint");
  });

  it("veterans (tutorial tips pre-marked) still get the later tips", () => {
    const veteran = ["launch", "collect", "portal", "park", "relaunch"];
    expect(tipFor({ type: "hint" }, veteran, true)).toBe("hint");
    expect(tipFor({ type: "parked", freeSlots: 1, slots: 4 }, veteran, true)).toBe("slotsTight");
    expect(tipFor({ type: "start" }, veteran, true)).toBe("boosters");
  });

  it("points at the next move quickly until the tutorial is done", () => {
    expect(hintDelayMs(false, 8000)).toBe(1500);
    expect(hintDelayMs(true, 8000)).toBe(8000);
    const save = (tips: string[], levels = {}, skipped: string[] = []) => ({
      tips,
      levels,
      skipped,
    });
    expect(tutorialDone(save(["launch", "park"]))).toBe(false);
    expect(tutorialDone(save(["relaunch"]))).toBe(true);
    // Won level 1 without ever parking, or skipped it after losing: the tutorial still ends.
    expect(tutorialDone(save(["launch"], { "moonlit-01": {} }))).toBe(true);
    expect(tutorialDone(save(["launch"], {}, ["moonlit-01"]))).toBe(true);
  });
});

describe("tip queue", () => {
  it("keeps a tip up for MIN_TIP_MS before the next one replaces it", () => {
    const q = new TipQueue();
    q.offer("collect");
    expect(q.tick(16)).toEqual({ seen: [], show: "collect" });
    q.offer("portal");
    expect(q.tick(MIN_TIP_MS - 100).show).toBeUndefined();
    expect(q.tick(100)).toEqual({ seen: ["collect"], show: "portal" });
  });

  it("saves a tip only once it was on screen long enough, or tapped away", () => {
    const q = new TipQueue();
    q.offer("launch");
    q.tick(0);
    expect(q.tick(1000).seen).toEqual([]);
    expect(q.dismiss()).toEqual(["launch"]);
    expect(q.current).toBeNull();

    q.offer("collect");
    q.tick(0);
    q.clear(); // the board ended before the tip could be read: it shows another time
    expect(q.tick(MIN_TIP_MS).seen).toEqual([]);

    q.offer("portal");
    q.offer("park");
    q.tick(0);
    q.clear(true); // a win: the tip on screen finishes, the queued one waits for another time
    expect(q.pending).toEqual(["portal"]);
    expect(q.tick(MIN_TIP_MS).seen).toEqual(["portal"]);
  });

  it("takes the banner down when a tip's lifetime is over", () => {
    const q = new TipQueue();
    q.offer("portal");
    q.tick(0);
    expect(q.tick(MIN_TIP_MS).seen).toEqual(["portal"]);
    expect(q.tick(tipLifetimeMs("portal") - MIN_TIP_MS)).toEqual({ seen: [], show: null });
  });

  it("ignores duplicates of queued or shown tips", () => {
    const q = new TipQueue();
    q.offer("park");
    q.offer("park");
    q.tick(0);
    q.offer("park");
    expect(q.pending).toEqual(["park"]);
  });

  it("level 1 at 1×: the tutorial tips show in order, each readable", () => {
    const built = worlds[0]!.levels[0]!;
    const s = createState(built.level);
    const q = new TipQueue();
    const saved: TipId[] = [];
    const shown: { id: TipId; at: number }[] = [];
    let now = 0;
    const offer = (t: TipTrigger) => {
      const id = tipFor(t, [...saved, ...q.pending]);
      if (id) q.offer(id);
    };
    const tick = (ms: number) => {
      now += ms;
      const r = q.tick(ms);
      saved.push(...r.seen);
      if (r.show) shown.push({ id: r.show, at: now });
    };
    offer({ type: "start" });
    tick(0);
    for (const move of built.solution) {
      launch(s, move);
      offer({ type: "launched", fromSlot: move.kind === "slot" });
      while (s.track.length > 0 && s.status === "playing") {
        for (const e of step(s)) {
          if (e.type === "collected") offer({ type: "collected" });
          if (e.type === "portal") offer({ type: "portal" });
          if (e.type === "parked") {
            const free = s.slots.filter((w) => w === null).length;
            offer({ type: "parked", freeSlots: free, slots: s.slots.length });
          }
        }
        tick(TICK_MS);
      }
    }
    expect(s.status).toBe("won");
    expect(shown.map((x) => x.id)).toEqual(["launch", "collect", "portal", "park", "relaunch"]);
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i]!.at - shown[i - 1]!.at).toBeGreaterThanOrEqual(MIN_TIP_MS);
    }
    for (const { id } of shown) expect(TIPS[id].length).toBeLessThanOrEqual(90);
  });
});
