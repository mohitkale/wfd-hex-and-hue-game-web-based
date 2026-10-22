import { describe, expect, it } from "vitest";
import { createState, launch, step } from "@hexhue/core";
import { worlds } from "./levels";
import { TIPS, hintDelayMs, tipFor, tutorialDone, type TipId, type TipTrigger } from "./tips";

describe("tips", () => {
  it("shows each tip once", () => {
    expect(tipFor({ type: "start" }, [])).toBe("launch");
    expect(tipFor({ type: "start" }, ["launch"])).toBeNull();
    expect(tipFor({ type: "collected" }, [])).toBe("collect");
    expect(tipFor({ type: "portal" }, ["portal"])).toBeNull();
    expect(tipFor({ type: "hint" }, ["relaunch"])).toBe("hint");
    expect(tipFor({ type: "hint" }, [])).toBeNull(); // mid-tutorial: the glow is the pointer
    expect(tipFor({ type: "hint" }, [], true)).toBe("hint");
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

  it("mentions free Retry and boosters only after a loss", () => {
    expect(tipFor({ type: "restarted", afterLoss: false }, [])).toBeNull();
    expect(tipFor({ type: "restarted", afterLoss: true }, [])).toBe("retry");
  });

  it("points at the next move quickly until the tutorial is done", () => {
    expect(hintDelayMs(false, 8000)).toBe(1500);
    expect(hintDelayMs(true, 8000)).toBe(8000);
    expect(tutorialDone({ tips: ["launch", "park"], levels: {} })).toBe(false);
    expect(tutorialDone({ tips: ["relaunch"], levels: {} })).toBe(true);
    // Won level 1 without ever parking a wisp: the tutorial still ends.
    expect(tutorialDone({ tips: ["launch"], levels: { "moonlit-01": {} } })).toBe(true);
  });

  it("level 1's solution walks through the whole tutorial", () => {
    const built = worlds[0]!.levels[0]!;
    const s = createState(built.level);
    const seen: TipId[] = [];
    const show = (t: TipTrigger) => {
      const id = tipFor(t, seen);
      if (id) seen.push(id);
    };
    show({ type: "start" });
    for (const move of built.solution) {
      launch(s, move);
      show({ type: "launched", fromSlot: move.kind === "slot" });
      while (s.track.length > 0 && s.status === "playing") {
        for (const e of step(s)) {
          if (e.type === "collected") show({ type: "collected" });
          if (e.type === "portal") show({ type: "portal" });
          if (e.type === "parked") {
            const free = s.slots.filter((w) => w === null).length;
            show({ type: "parked", freeSlots: free, slots: s.slots.length });
          }
        }
      }
    }
    expect(s.status).toBe("won");
    expect(seen.slice(0, 5)).toEqual(["launch", "collect", "portal", "park", "relaunch"]);
    for (const id of seen) expect(TIPS[id].length).toBeLessThan(110);
  });
});
