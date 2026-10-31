import { describe, expect, it } from "vitest";
import {
  act,
  checkLesson,
  lessonProgress,
  lessonSummary,
  sameAction,
  startLesson,
  type Action,
  type Lesson,
  type LessonRun,
} from "./lesson";

const lesson: Lesson = {
  id: "test-circle",
  title: "A test circle",
  branch: "elements",
  minutes: 3,
  intro: "A small lesson for the tests.",
  steps: [
    {
      id: "tools",
      prompt: "Set out the four tools.",
      expects: [
        { kind: "place", item: "feather", spot: "east" },
        { kind: "place", item: "candle", spot: "south" },
      ],
      order: "any-order",
      hint: "Each tool has its own direction.",
      why: "The tools stand for the elements.",
    },
    {
      id: "light",
      prompt: "Light the candles, east first.",
      expects: [
        { kind: "light", item: "east" },
        { kind: "light", item: "south" },
      ],
      order: "in-order",
      hint: "Begin in the east, where the sun rises.",
      why: "Many witches move sunwise.",
    },
    {
      id: "breathe",
      prompt: "Breathe three times.",
      expects: [{ kind: "breathe", breaths: 3 }],
      order: "in-order",
      hint: "Follow the pulse.",
      why: "Breath settles the mind.",
    },
  ],
};

function play(actions: Action[], run: LessonRun = startLesson(lesson)) {
  const replies = [];
  for (const a of actions) {
    const out = act(lesson, run, a);
    run = out.run;
    replies.push(out.reply);
  }
  return { run, replies };
}

describe("lesson runner", () => {
  it("plays a lesson to the end", () => {
    const { run, replies } = play([
      { kind: "place", item: "candle", spot: "south" },
      { kind: "place", item: "feather", spot: "east" },
      { kind: "light", item: "east" },
      { kind: "light", item: "south" },
      { kind: "breathe", breaths: 3 },
    ]);
    expect(replies.map((r) => r.kind)).toEqual(["right", "right", "right", "right", "done"]);
    expect(replies[1]).toEqual({ kind: "right", stepDone: true });
    expect(run.finished).toBe(true);
    expect(run.step).toBe(3);
    expect(lessonProgress(lesson, run)).toBe(1);
  });

  it("enforces order only where the step asks for it", () => {
    const { run, replies } = play([
      { kind: "place", item: "feather", spot: "east" },
      { kind: "place", item: "candle", spot: "south" },
      { kind: "light", item: "south" },
    ]);
    expect(replies[2]).toEqual({
      kind: "try-again",
      hint: "Begin in the east, where the sun rises.",
    });
    expect(run.step).toBe(1);
    expect(run.tries).toEqual([0, 1, 0]);
  });

  it("answers a repeated move with 'already', at no cost", () => {
    const first = { kind: "place", item: "feather", spot: "east" } as const;
    const { run, replies } = play([first, first]);
    expect(replies[1]).toEqual({ kind: "already" });
    expect(run.tries).toEqual([0, 0, 0]);
    expect(run.doneInStep).toEqual([0]);
  });

  it("counts a wrong move without losing progress", () => {
    const { run } = play([
      { kind: "place", item: "feather", spot: "east" },
      { kind: "place", item: "feather", spot: "west" },
    ]);
    expect(run.doneInStep).toEqual([0]);
    expect(run.tries[0]).toBe(1);
  });

  it("accepts more breaths than asked, not fewer", () => {
    const before = play([
      { kind: "place", item: "feather", spot: "east" },
      { kind: "place", item: "candle", spot: "south" },
      { kind: "light", item: "east" },
      { kind: "light", item: "south" },
    ]).run;
    expect(act(lesson, before, { kind: "breathe", breaths: 2 }).reply.kind).toBe("try-again");
    expect(act(lesson, before, { kind: "breathe", breaths: 5 }).reply.kind).toBe("done");
  });

  it("ignores moves after the end", () => {
    const done = { ...startLesson(lesson), step: 3, finished: true };
    expect(act(lesson, done, { kind: "continue" })).toEqual({ run: done, reply: { kind: "done" } });
  });

  it("reports progress through the actions", () => {
    const { run } = play([
      { kind: "place", item: "feather", spot: "east" },
      { kind: "place", item: "candle", spot: "south" },
      { kind: "light", item: "east" },
    ]);
    expect(lessonProgress(lesson, run)).toBeCloseTo(3 / 5);
  });

  it("keeps the run plain data that survives a save", () => {
    const { run } = play([{ kind: "place", item: "feather", spot: "east" }]);
    const resumed = JSON.parse(JSON.stringify(run)) as LessonRun;
    expect(act(lesson, resumed, { kind: "place", item: "candle", spot: "south" }).reply).toEqual({
      kind: "right",
      stepDone: true,
    });
  });

  it("summarises every step with its reason and the tries", () => {
    const { run } = play([{ kind: "light", item: "north" }]);
    const summary = lessonSummary(lesson, run);
    expect(summary.map((s) => s.id)).toEqual(["tools", "light", "breathe"]);
    expect(summary[0]).toMatchObject({ why: "The tools stand for the elements.", tries: 1 });
  });

  it("finishes an empty lesson at once", () => {
    const empty = { ...lesson, steps: [] };
    expect(startLesson(empty).finished).toBe(true);
    expect(lessonProgress(empty, startLesson(empty))).toBe(1);
  });
});

describe("sameAction", () => {
  it("compares every field of the move", () => {
    expect(sameAction({ kind: "light", item: "a" }, { kind: "snuff", item: "a" })).toBe(false);
    expect(sameAction({ kind: "walk", path: "circle" }, { kind: "walk", path: "circle" })).toBe(
      true,
    );
    expect(sameAction({ kind: "trace", shape: "x" }, { kind: "trace", shape: "y" })).toBe(false);
    expect(sameAction({ kind: "choose", option: "a" }, { kind: "choose", option: "a" })).toBe(true);
    expect(sameAction({ kind: "continue" }, { kind: "breathe", breaths: 1 })).toBe(false);
  });
});

describe("checkLesson", () => {
  it("passes a sound lesson", () => {
    expect(checkLesson(lesson)).toEqual([]);
  });

  it("finds the structural problems", () => {
    const step = lesson.steps[0]!;
    const bad: Lesson = {
      ...lesson,
      id: " ",
      minutes: 0,
      branch: "nowhere" as Lesson["branch"],
      steps: [
        { ...step, hint: "" },
        { ...step, why: "" },
        { ...step, id: "empty", expects: [] },
        {
          ...step,
          id: "mixed",
          expects: [{ kind: "continue" }, { kind: "light", item: "a" }],
        },
        {
          ...step,
          id: "twice",
          expects: [
            { kind: "breathe", breaths: 3 },
            { kind: "breathe", breaths: 5 },
          ],
        },
        { ...step, id: "half", expects: [{ kind: "breathe", breaths: 1.5 }] },
      ],
    };
    expect(checkLesson(bad)).toEqual([
      "lesson has no id",
      'unknown branch "nowhere"',
      "minutes must be more than 0",
      'step "tools" has no hint',
      'duplicate step id "tools"',
      'step "tools" has no why',
      'step "empty" expects nothing',
      'step "mixed" mixes "continue" with other actions',
      'step "twice" expects the same action twice',
      'step "half" asks for a breath count that is not a whole number of 1 or more',
    ]);
  });
});
