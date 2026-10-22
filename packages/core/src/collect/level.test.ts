import { describe, expect, it } from "vitest";
import { board, fixtureA, fixtureB, fixtureD } from "./fixtures";
import {
  COLLECT_LIMITS,
  parseCollectLevel,
  validateCollectLevel,
  type CollectLevel,
} from "./level";
import { createCollectState } from "./state";
import { paddedIndex } from "./grid";

describe("validateCollectLevel", () => {
  it("accepts the fixtures", () => {
    for (const level of [fixtureA(), fixtureB(), fixtureD()]) {
      expect(validateCollectLevel(level), level.id).toEqual([]);
    }
  });

  it("requires per-colour capacity to equal the cube count", () => {
    const level = fixtureA();
    level.columns[1]![0]!.capacity = 2;
    expect(validateCollectLevel(level).join()).toContain("capacities total 4 but the mosaic has 3");
  });

  it("checks limits and fields", () => {
    const bad = (patch: Partial<CollectLevel>, text: string) =>
      expect(validateCollectLevel({ ...fixtureA(), ...patch }).join(), text).toContain(text);
    bad({ slots: 0 }, "slots must be");
    bad({ slots: COLLECT_LIMITS.maxSlots + 1 }, "slots must be");
    bad({ squad: 0 }, "squad must be");
    bad({ spawnGap: 0 }, "spawnGap must be");
    bad({ fieldCap: 7 }, "fieldCap must be");
    bad({ width: 41 }, "width must be");
    bad({ portalX: 3 }, "portalX must be");
    bad({ portalX: -1 }, "portalX must be");
    bad({ palette: ["red"] }, "not #rrggbb");
    bad({ columns: [] }, "columns must have");
    bad({ columns: [[]] }, "is empty");
    bad({ cells: [0, 0] }, "cells has 2 entries");
    bad({ cells: [0, 0, 9] }, "not EMPTY or a palette index");
  });

  it("rejects a level with no legal first action (R-20)", () => {
    // Red is sealed in and the only front group is red.
    const level = board(
      ["BBB", "BRB", "BBB"],
      [
        [
          ["R", 1],
          ["B", 8],
        ],
      ],
      { colors: "BR" },
    );
    expect(validateCollectLevel(level).join()).toContain("no legal first action");
  });

  it("uses the default portal column and honours an override", () => {
    expect(createCollectState(fixtureB()).params.portal).toBe(paddedIndex(7, 2, 4));
    const level = { ...fixtureB(), portalX: 0 };
    expect(createCollectState(level).params.portal).toBe(paddedIndex(7, 0, 4));
    expect(createCollectState(level).dist[paddedIndex(7, 0, 4)]).toBe(0);
  });
});

describe("parseCollectLevel", () => {
  it("round-trips a level through JSON", () => {
    const level = fixtureB();
    expect(parseCollectLevel(JSON.parse(JSON.stringify(level)))).toEqual(level);
    const withPortal = { ...fixtureA(), portalX: 2 };
    expect(parseCollectLevel(JSON.parse(JSON.stringify(withPortal)))).toEqual(withPortal);
  });

  it("rejects bad shapes and bad rules with readable messages", () => {
    expect(() => parseCollectLevel(null)).toThrow("not an object");
    expect(() => parseCollectLevel({ ...fixtureA(), width: "3" })).toThrow(
      "width must be a number",
    );
    expect(() => parseCollectLevel({ ...fixtureA(), columns: [[{ color: 0 }]] })).toThrow(
      "must be {color, capacity}",
    );
    const bad = fixtureA();
    bad.slots = 0;
    expect(() => parseCollectLevel(bad)).toThrow("slots must be");
  });
});
