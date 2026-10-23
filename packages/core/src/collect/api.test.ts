import { describe, expect, it } from "vitest";
import { collect } from "@hexhue/core";
import { fixtureB } from "./fixtures";

/** The package's public surface: what the renderer and tools can import from `@hexhue/core`. */
describe("collect public API (@hexhue/core)", () => {
  it("exports the documented names", () => {
    const names = Object.keys(collect).sort();
    for (const expected of [
      "COLLECT_LIMITS",
      "CollectSession",
      "IllegalActionError",
      "ReplayError",
      "apply",
      "cloneState",
      "computeDist",
      "createCollectState",
      "defaultPortalX",
      "explain",
      "firstFreeSlot",
      "freeSlots",
      "fromJSON",
      "groupViews",
      "hasAssignable",
      "hashState",
      "isSettled",
      "legalActions",
      "nearestTarget",
      "paddedIndex",
      "parseCollectLevel",
      "remaining",
      "replay",
      "runUntilSettled",
      "slotViews",
      "stateKey",
      "step",
      "topologyFor",
      "uncommitted",
      "validateCollectLevel",
    ]) {
      expect(names, expected).toContain(expected);
    }
  });

  it("plays and wins a whole puzzle using only the package export", () => {
    const level = collect.parseCollectLevel(JSON.parse(JSON.stringify(fixtureB())));
    const session = new collect.CollectSession(level);
    const play = (action: ReturnType<typeof collect.legalActions>[number]) => {
      expect(session.tap(action).ok).toBe(true);
      for (let i = 0; i < 5_000 && session.tick() !== null; i++) {
        /* run to settled */
      }
    };
    play({ kind: "select", column: 2 }); // clear the blue first
    play({ kind: "select", column: 0 });
    play({ kind: "select", column: 1 });
    expect(session.state.status).toBe("won");
    expect(collect.replay(level, session.log).state.status).toBe("won");
    expect(collect.groupViews(session.state).every((g) => g.status === "completed")).toBe(true);
    expect(collect.hashState(collect.replay(level, session.log).state)).toBe(
      collect.hashState(session.state as ReturnType<typeof collect.createCollectState>),
    );
  });
});
