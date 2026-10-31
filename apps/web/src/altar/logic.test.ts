import { startLesson, type AltarLayout, type AltarState, type GrimoireEntry } from "@hexhue/learn";
import { describe, expect, it } from "vitest";
import { flameAt, gestureAction, safetyFirst, tapAction, usedTools } from "./logic";

const altar: AltarLayout = {
  spots: [
    { id: "north", label: "North", x: 0.5, y: 0.1 },
    { id: "holder", label: "Holder", x: 0.5, y: 0.5 },
    { id: "plate", label: "Plate", x: 0.5, y: 0.8 },
  ],
  tools: [
    { id: "blue", label: "Blue candle", icon: "candle", color: "#3d7be0" },
    { id: "bell", label: "Bell", icon: "bell" },
    { id: "sprig", label: "Sprig", icon: "sprig" },
  ],
  candles: [{ id: "north-candle", spot: "north", color: "#3fa45b" }],
  traces: [{ id: "dress-up", spot: "holder", direction: "up", label: "Up" }],
};
const state = (placed: Record<string, string>, lit: string[] = []): AltarState => ({
  placed,
  lit,
  walked: [],
});

describe("taps", () => {
  it("finds the flame on a spot: a standing candle or a placed candle tool", () => {
    expect(flameAt(altar, state({}), "north")).toBe("north-candle");
    expect(flameAt(altar, state({ holder: "blue" }), "holder")).toBe("blue");
    expect(flameAt(altar, state({ plate: "bell" }), "plate")).toBeNull();
  });

  it("places the selected tool, else lights or snuffs, else nothing", () => {
    expect(tapAction(altar, state({}), "plate", "sprig")).toEqual({
      kind: "place",
      item: "sprig",
      spot: "plate",
    });
    expect(tapAction(altar, state({}), "north", null)).toEqual({
      kind: "light",
      item: "north-candle",
    });
    expect(tapAction(altar, state({}, ["north-candle"]), "north", null)).toEqual({
      kind: "snuff",
      item: "north-candle",
    });
    expect(tapAction(altar, state({}), "plate", null)).toBeNull();
  });
});

describe("gestures", () => {
  it("reads a circle as a walk before anything else", () => {
    expect(gestureAction(altar, "sunwise", "holder", "up")).toEqual({
      kind: "walk",
      path: "sunwise",
    });
  });

  it("needs a trace's own spot and direction", () => {
    expect(gestureAction(altar, null, "holder", "up")).toEqual({
      kind: "trace",
      shape: "dress-up",
    });
    expect(gestureAction(altar, null, "holder", "down")).toBeNull();
    expect(gestureAction(altar, null, "plate", "up")).toBeNull();
    expect(gestureAction(altar, null, null, "up")).toBeNull();
  });
});

const entry: GrimoireEntry = {
  lesson: {
    id: "t",
    title: "T",
    branch: "elements",
    minutes: 1,
    intro: "i",
    steps: [
      {
        id: "a",
        prompt: "p",
        expects: [{ kind: "place", item: "blue", spot: "holder" }],
        order: "in-order",
        hint: "h",
        why: "w",
      },
      {
        id: "b",
        prompt: "p",
        expects: [
          { kind: "light", item: "blue" },
          { kind: "light", item: "north-candle" },
        ],
        order: "in-order",
        hint: "h",
        why: "w",
      },
      {
        id: "c",
        prompt: "p",
        expects: [{ kind: "continue" }],
        order: "in-order",
        hint: "h",
        why: "w",
      },
    ],
  },
  topics: ["candle"],
  safety: { fire: "Care." },
  review: { status: "draft" },
  altar,
};

describe("the ritual card's tools", () => {
  it("lists only what the ritual uses, standing candles included", () => {
    expect(usedTools(entry).map((t) => t.id)).toEqual(["blue", "north-candle"]);
  });
});

describe("fire safety", () => {
  it("comes first while a flame is still to be lit, also on a resume", () => {
    const run = startLesson(entry.lesson);
    expect(safetyFirst(entry, run)).toBe(true);
    expect(safetyFirst(entry, { ...run, step: 1 })).toBe(true);
    expect(safetyFirst(entry, { ...run, step: 2 })).toBe(false);
    expect(safetyFirst({ ...entry, safety: {} }, run)).toBe(false);
  });
});
