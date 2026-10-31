import { describe, expect, it } from "vitest";
import { startLesson, type Lesson } from "./lesson";
import {
  emptyPractice,
  exportPractice,
  importPractice,
  mergePractice,
  parsePractice,
  pathProgress,
  practiceDays,
  recordFinish,
  recordPracticeDay,
  saveRun,
} from "./practice";

const lesson: Lesson = {
  id: "four-elements",
  title: "Four",
  branch: "elements",
  minutes: 3,
  intro: "Intro",
  steps: [
    {
      id: "s",
      prompt: "p",
      expects: [{ kind: "continue" }],
      order: "in-order",
      hint: "h",
      why: "w",
    },
  ],
};

describe("practice save", () => {
  it("counts practice days up only, once per day", () => {
    let save = recordPracticeDay(emptyPractice(), "2026-11-02");
    save = recordPracticeDay(save, "2026-11-01");
    save = recordPracticeDay(save, "2026-11-02");
    save = recordPracticeDay(save, "not a day");
    expect(save.days).toEqual(["2026-11-01", "2026-11-02"]);
    // A long gap loses nothing.
    expect(practiceDays(recordPracticeDay(save, "2027-03-01"))).toBe(3);
  });

  it("records finishes: first day kept, count up, run cleared", () => {
    let save = saveRun(emptyPractice(), startLesson(lesson));
    expect(Object.keys(save.runs)).toEqual(["four-elements"]);
    save = recordFinish(save, "four-elements", "2026-11-01");
    save = recordFinish(save, "four-elements", "2026-11-05");
    expect(save.finished["four-elements"]).toEqual({ first: "2026-11-01", times: 2 });
    expect(save.runs).toEqual({});
    expect(save.days).toEqual(["2026-11-01", "2026-11-05"]);
  });

  it("clears a finished run", () => {
    const run = { ...startLesson(lesson), step: 1, finished: true };
    expect(saveRun(emptyPractice(), run).runs).toEqual({});
  });

  it("parses stored data defensively", () => {
    expect(parsePractice(null)).toEqual(emptyPractice());
    expect(parsePractice({ version: 2 })).toEqual(emptyPractice());
    const run = startLesson(lesson);
    const parsed = parsePractice({
      version: 1,
      finished: {
        good: { first: "2026-11-01", times: 2 },
        zero: { first: "2026-11-01", times: 0 },
        badDay: { first: "yesterday", times: 1 },
        __proto__: { first: "2026-11-01", times: 1 },
      },
      days: ["2026-11-02", "2026-11-01", "2026-11-01", 5],
      runs: { "four-elements": run, other: run, broken: { lesson: "broken" } },
    });
    expect(parsed).toEqual({
      version: 1,
      finished: { good: { first: "2026-11-01", times: 2 } },
      days: ["2026-11-01", "2026-11-02"],
      runs: { "four-elements": run },
    });
  });
});

describe("the Path", () => {
  it("lists every branch with lessons as nodes, lit when finished", () => {
    const lessons = [
      { id: "a", branch: "elements" },
      { id: "m", branch: "moon" },
      { id: "b", branch: "elements" },
    ] as const;
    const save = recordFinish(emptyPractice(), "b", "2026-11-01");
    expect(pathProgress(lessons, save)).toEqual([
      {
        branch: "elements",
        nodes: [
          { id: "a", lit: false },
          { id: "b", lit: true },
        ],
        lit: 1,
        total: 2,
      },
      { branch: "moon", nodes: [{ id: "m", lit: false }], lit: 0, total: 1 },
    ]);
  });
});

describe("export and import", () => {
  const mine = recordFinish(emptyPractice(), "a", "2026-11-03");

  it("round-trips through the file", () => {
    const out = importPractice(emptyPractice(), exportPractice(mine));
    expect(out).toEqual({ ok: true, save: mine });
  });

  it("merges without losing practice", () => {
    let theirs = recordFinish(emptyPractice(), "a", "2026-10-01");
    theirs = recordFinish(theirs, "a", "2026-10-02");
    theirs = recordFinish(theirs, "b", "2026-10-02");
    const merged = mergePractice(mine, theirs);
    expect(merged.finished).toEqual({
      a: { first: "2026-10-01", times: 2 },
      b: { first: "2026-10-02", times: 1 },
    });
    expect(merged.days).toEqual(["2026-10-01", "2026-10-02", "2026-11-03"]);
  });

  it("refuses files that are not practice files", () => {
    expect(importPractice(mine, "{nope")).toEqual({
      ok: false,
      error: "That file could not be read.",
    });
    expect(importPractice(mine, '{"version":1}')).toEqual({
      ok: false,
      error: "That is not a Hex & Hue practice file.",
    });
    expect(importPractice(mine, '{"file":"hexhue-practice","version":9}')).toMatchObject({
      ok: false,
    });
  });
});
