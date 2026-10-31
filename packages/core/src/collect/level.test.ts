import { describe, expect, it } from "vitest";
import { board, fixtureA, fixtureB, fixtureD } from "./fixtures";
import {
  COLLECT_LIMITS,
  parseCollectLevel,
  validateCollectLevel,
  type CollectLevel,
} from "./level";
import { legalActions } from "./actions";
import { CollectSession } from "./session";
import { createCollectState, hashState } from "./state";
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
    bad({ width: COLLECT_LIMITS.maxSize + 1 }, "width must be");
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

describe("shades (display-only looks within a colour family)", () => {
  /** Two shades per colour: even cube index = base, odd = a lighter one. */
  function shaded(level: CollectLevel): CollectLevel {
    const colors = level.palette.flatMap((hex) => [hex, "#ffffff"]);
    const family = level.palette.flatMap((_, i) => [i, i]);
    const cells = level.cells.map((c, i) => (c < 0 ? -1 : c * 2 + (i % 2)));
    return { ...level, shades: { colors, family, cells } };
  }

  it("accepts a level whose cubes carry shades of their own family", () => {
    expect(validateCollectLevel(shaded(fixtureB()))).toEqual([]);
  });

  it("round-trips through JSON", () => {
    const level = shaded(fixtureB());
    expect(parseCollectLevel(JSON.parse(JSON.stringify(level)))).toEqual(level);
  });

  it("rejects a shade from the wrong family, a shade on an empty cell and bad shapes", () => {
    const wrongFamily = shaded(fixtureB());
    const i = wrongFamily.cells.findIndex((c) => c === 0);
    wrongFamily.shades!.cells[i] = 2;
    expect(validateCollectLevel(wrongFamily).join()).toContain("belongs to family");

    const onEmpty = shaded(fixtureB());
    const e = onEmpty.cells.findIndex((c) => c < 0);
    if (e >= 0) {
      onEmpty.shades!.cells[e] = 0;
      expect(validateCollectLevel(onEmpty).join()).toContain("the cell is empty");
    }

    const short = shaded(fixtureB());
    short.shades!.cells.pop();
    expect(validateCollectLevel(short).join()).toContain("shades.cells has");

    const badColor = shaded(fixtureB());
    badColor.shades!.colors[0] = "red";
    expect(validateCollectLevel(badColor).join()).toContain("is not #rrggbb");

    const badFamily = shaded(fixtureB());
    badFamily.shades!.family[0] = 99;
    expect(validateCollectLevel(badFamily).join()).toContain("is not a palette index");

    expect(() => parseCollectLevel({ ...shaded(fixtureB()), shades: "no" })).toThrow(
      "shades must be an object",
    );
  });

  it("limits the number of shades", () => {
    const level = shaded(fixtureB());
    const n = COLLECT_LIMITS.maxShades + 1;
    level.shades!.colors = Array.from({ length: n }, () => "#ffffff");
    level.shades!.family = Array.from({ length: n }, () => 0);
    expect(validateCollectLevel(level).join()).toContain("shades must have");
  });

  it("never changes the game: the same taps give the same state, tick by tick, with and without", () => {
    const run = (level: CollectLevel) => {
      const session = new CollectSession(level);
      const hashes: string[] = [];
      for (let guard = 0; session.state.status === "playing" && guard < 5000; guard++) {
        const legal = legalActions(session.state);
        if (legal.length > 0) session.tap(legal[0]!);
        else if (session.tick() === null) break;
        hashes.push(hashState(session.state));
      }
      return { hashes, status: session.state.status };
    };
    const plain = run(fixtureB());
    const withShades = run(shaded(fixtureB()));
    expect(plain.hashes.length).toBeGreaterThan(5);
    expect(withShades).toEqual(plain);
  });
});

describe("subject (what a finished picture is)", () => {
  const subject = { id: "black-cat", name: "Black Cat", theme: "familiar", lore: "A cat." };

  it("round-trips and never changes the game", () => {
    const level = { ...fixtureB(), subject };
    expect(validateCollectLevel(level)).toEqual([]);
    expect(parseCollectLevel(JSON.parse(JSON.stringify(level)))).toEqual(level);
    expect(hashState(createCollectState(level))).toBe(hashState(createCollectState(fixtureB())));
  });

  it("rejects missing or empty fields", () => {
    expect(
      validateCollectLevel({ ...fixtureB(), subject: { ...subject, lore: " " } }).join(),
    ).toContain("subject.lore must be a non-empty string");
    expect(() => parseCollectLevel({ ...fixtureB(), subject: { id: "x" } })).toThrow(
      "subject.name must be a string",
    );
    expect(() => parseCollectLevel({ ...fixtureB(), subject: 3 })).toThrow(
      "subject must be an object",
    );
  });
});
