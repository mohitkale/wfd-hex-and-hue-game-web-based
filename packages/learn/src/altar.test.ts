import { describe, expect, it } from "vitest";
import { altarState, checkAltar, doneActions, type AltarLayout } from "./altar";
import { act, startLesson, type Action, type Lesson } from "./lesson";

const lesson: Lesson = {
  id: "altar-test",
  title: "Altar",
  branch: "elements",
  minutes: 2,
  intro: "Intro",
  steps: [
    {
      id: "set",
      prompt: "Set the candle and the stone.",
      expects: [
        { kind: "place", item: "candle", spot: "south" },
        { kind: "place", item: "stone", spot: "north" },
      ],
      order: "any-order",
      hint: "h",
      why: "w",
    },
    {
      id: "move",
      prompt: "Move the stone to the centre.",
      expects: [{ kind: "place", item: "stone", spot: "centre" }],
      order: "in-order",
      hint: "h",
      why: "w",
    },
    {
      id: "light",
      prompt: "Light both.",
      expects: [
        { kind: "light", item: "candle" },
        { kind: "light", item: "east-candle" },
      ],
      order: "in-order",
      hint: "h",
      why: "w",
    },
    {
      id: "walk",
      prompt: "Walk the circle.",
      expects: [{ kind: "walk", path: "sunwise" }],
      order: "in-order",
      hint: "h",
      why: "w",
    },
    {
      id: "dress",
      prompt: "Dress it.",
      expects: [{ kind: "trace", shape: "candle-up" }],
      order: "in-order",
      hint: "h",
      why: "w",
    },
    {
      id: "out",
      prompt: "Snuff the east candle.",
      expects: [{ kind: "snuff", item: "east-candle" }],
      order: "in-order",
      hint: "h",
      why: "w",
    },
  ],
};

const altar: AltarLayout = {
  spots: [
    { id: "north", label: "North", x: 0.5, y: 0.1 },
    { id: "south", label: "South", x: 0.5, y: 0.9 },
    { id: "east", label: "East", x: 0.9, y: 0.5 },
    { id: "centre", label: "Centre", x: 0.5, y: 0.5 },
  ],
  tools: [
    { id: "candle", label: "Candle", icon: "candle", color: "#ffffff" },
    { id: "stone", label: "Stone", icon: "stone" },
    { id: "bell", label: "Bell", icon: "bell" },
  ],
  candles: [{ id: "east-candle", spot: "east", color: "#f6d97a" }],
  traces: [{ id: "candle-up", spot: "south", direction: "up", label: "Dress upward" }],
};

function playAll(actions: Action[]) {
  let run = startLesson(lesson);
  for (const a of actions) run = act(lesson, run, a).run;
  return run;
}

describe("altar state", () => {
  it("replays places, moves, lights, walks and snuffs", () => {
    const run = playAll([
      { kind: "place", item: "stone", spot: "north" },
      { kind: "place", item: "candle", spot: "south" },
      { kind: "place", item: "stone", spot: "centre" },
      { kind: "light", item: "candle" },
      { kind: "light", item: "east-candle" },
      { kind: "walk", path: "sunwise" },
      { kind: "trace", shape: "candle-up" },
      { kind: "snuff", item: "east-candle" },
    ]);
    expect(run.finished).toBe(true);
    expect(altarState(lesson, run)).toEqual({
      placed: { south: "candle", centre: "stone" },
      lit: ["candle"],
      walked: ["sunwise"],
    });
  });

  it("shows a step done halfway", () => {
    const run = playAll([{ kind: "place", item: "stone", spot: "north" }]);
    expect(doneActions(lesson, run)).toEqual([{ kind: "place", item: "stone", spot: "north" }]);
    expect(altarState(lesson, run).placed).toEqual({ north: "stone" });
  });

  it("starts empty", () => {
    expect(altarState(lesson, startLesson(lesson))).toEqual({ placed: {}, lit: [], walked: [] });
  });
});

describe("checkAltar", () => {
  it("passes a playable altar", () => {
    expect(checkAltar(lesson, altar)).toEqual([]);
  });

  it("finds everything a step could not do", () => {
    const bad: AltarLayout = {
      spots: [
        { id: "north", label: "North", x: 0.5, y: 1.5 },
        { id: "north", label: "Again", x: 0.5, y: 0.5 },
      ],
      tools: [{ id: "stone", label: "Stone", icon: "stone" }],
      candles: [{ id: "stone", spot: "moon", color: "#fff" }],
      traces: [{ id: "x", spot: "nowhere", direction: "up", label: "X" }],
    };
    const walkLesson: Lesson = {
      ...lesson,
      steps: [
        ...lesson.steps,
        { ...lesson.steps[3]!, id: "dance", expects: [{ kind: "walk", path: "spiral" }] },
      ],
    };
    expect(checkAltar(walkLesson, bad)).toEqual([
      "altar has duplicate spot ids",
      "altar has duplicate tool ids",
      'spot "north" is off the altar',
      'candle "stone" stands on unknown spot "moon"',
      'trace "x" is on unknown spot "nowhere"',
      'step "set" places "candle", not in the tray',
      'step "set" uses unknown spot "south"',
      'step "move" uses unknown spot "centre"',
      'step "light" lights "candle", not on the altar',
      'step "light" lights "east-candle", not on the altar',
      'step "dress" traces unknown "candle-up"',
      'step "out" snuffs "east-candle", not on the altar',
      'step "dance" walks "spiral"; walks are sunwise or widdershins',
    ]);
  });
});
