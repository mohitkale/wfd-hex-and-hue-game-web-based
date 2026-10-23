import type * as collect from "@hexhue/core/collect";
import type { Step, Target } from "./tutorial";

/**
 * The four tutorial levels (M14.2, docs/V2_ONBOARDING.md), each tiny, each teaching one thing and
 * each solver-verified: summon and watch, a buried colour, slots, and undoing a mistake. Their hints
 * are scripts over the game state (`tutorial.ts`).
 */

const RED = "#e24a4a";
const GREEN = "#4ae26b";
const BLUE = "#4a6be2";

function level(
  id: string,
  name: string,
  rows: string[],
  colors: string,
  palette: string[],
  columns: [string, number][][],
  opts: Partial<collect.CollectLevel> = {},
): collect.CollectLevel {
  return {
    id,
    name,
    width: rows[0]!.length,
    height: rows.length,
    palette,
    cells: rows.flatMap((r) => [...r].map((c) => (c === "." ? -1 : colors.indexOf(c)))),
    columns: columns.map((col) =>
      col.map(([c, capacity]) => ({ color: colors.indexOf(c), capacity })),
    ),
    slots: 2,
    squad: 3,
    spawnGap: 2,
    fieldCap: 3,
    ...opts,
  };
}

type State = Readonly<collect.CollectState>;
const col = (index: number): Target => ({ kind: "column", index });
const none = (): Target => null;
/** Groups of one palette colour. */
const of = (s: State, color: number) => s.groups.filter((g) => g.color === color);
const started = (s: State, color: number) => of(s, color).some((g) => g.status !== "queued");
const won = (s: State) => s.status === "won";
const firstWaiting = (s: State): number => s.slots.findIndex((id) => id !== null);

/** 1. Summon, watch them carry cubes home, watch the number count down. */
const summon = (): collect.CollectLevel =>
  level("tutorial-summon", "Summon", ["RRRR", "RRRR"], "R", [RED], [[["R", 4]], [["R", 4]]], {
    slots: 2,
  });

const summonScript: Step[] = [
  {
    id: "summon",
    text: "Tap a group to summon it",
    target: () => col(0),
    done: ({ state }) => state.groups.some((g) => g.status !== "queued"),
  },
  {
    id: "watch",
    text: "Watch the number count down",
    target: none,
    done: ({ state }) => state.deliveredTotal >= 3,
  },
  {
    id: "again",
    text: "Tap the next group",
    target: (s) => col(s.columns.findIndex((c) => c.length > 0)),
    done: ({ state }) =>
      won(state) || state.groups.filter((g) => g.status !== "queued").length >= 2,
  },
];

/** 2. A buried colour: red cannot be reached until the blue around it is gone. */
const blocked = (): collect.CollectLevel =>
  level(
    "tutorial-blocked",
    "Buried",
    ["BBBBB", "BBRBB", "BBBBB"],
    "BR",
    [BLUE, RED],
    [[["R", 1]], [["B", 14]]],
  );

const blockedScript: Step[] = [
  {
    id: "try-red",
    text: "Red is buried. Tap it",
    target: () => col(0),
    done: ({ state, seen }) => seen.has("rejected") || started(state, 0),
  },
  {
    id: "clear-blue",
    text: "Clear the blue around it",
    target: () => col(1),
    done: ({ state }) => started(state, 0),
  },
  {
    id: "red-free",
    text: "Now red is free: tap it",
    target: () => col(0),
    done: ({ state }) => won(state) || started(state, 1),
  },
];

/** 3. Slots: a group with nothing left to reach waits, then is sent again. */
const slots = (): collect.CollectLevel =>
  level(
    "tutorial-slots",
    "Waiting",
    ["BBBBB", "BRBGB", "BBBBB", "BRBGB"],
    "BRG",
    [BLUE, RED, GREEN],
    [[["R", 2]], [["G", 2]], [["B", 16]]],
    { slots: 2 },
  );

const slotsScript: Step[] = [
  {
    id: "send-red",
    text: "Tap the red group",
    target: () => col(0),
    done: ({ state }) => state.groups[0]!.status !== "queued",
  },
  {
    id: "waits",
    text: "Nothing left to reach: it waits",
    target: () => ({ kind: "slot", index: 0 }),
    done: ({ state }) => state.slots.some((id) => id !== null) || won(state),
  },
  {
    id: "clear-blue",
    text: "Clear the blue first",
    target: () => col(2),
    done: ({ state }) => started(state, 0),
  },
  {
    id: "wake",
    text: "Tap the waiting group",
    target: (s) => ({ kind: "slot", index: Math.max(0, firstWaiting(s)) }),
    done: ({ state }) => state.slots.every((id) => id === null),
  },
];

/** 4. A mistake and undo: one slot only, so the wrong order loses and Undo takes it back. */
const undo = (): collect.CollectLevel =>
  level(
    "tutorial-undo",
    "Undo",
    ["BBBBB", "BRBGB", "BBBBB", "BRBGB"],
    "BRG",
    [BLUE, RED, GREEN],
    [[["R", 2]], [["G", 2]], [["B", 16]]],
    { slots: 1 },
  );

const undoScript: Step[] = [
  {
    id: "red",
    text: "Tap the red group",
    target: () => col(0),
    done: ({ state }) => state.groups[0]!.status !== "queued",
  },
  {
    id: "green",
    text: "Now tap the green group",
    target: () => col(1),
    done: ({ state }) => state.groups[1]!.status !== "queued" || state.status === "lost",
  },
  {
    id: "undo",
    text: "Out of slots. Tap Undo",
    target: () => ({ kind: "undo" }),
    done: ({ seen, state }) => seen.has("undone") && state.status === "playing",
  },
  {
    id: "blue",
    text: "Clear the blue first",
    target: () => col(2),
    done: ({ state }) => started(state, 0),
  },
  {
    id: "finish",
    text: "Wake red, then green",
    target: (s) => {
      const w = firstWaiting(s);
      if (w >= 0) return { kind: "slot", index: w };
      const next = s.columns.findIndex((c) => c.length > 0);
      return next >= 0 ? col(next) : null;
    },
    done: ({ state }) => won(state),
  },
];

export interface TutorialLevel {
  id: string;
  make: () => collect.CollectLevel;
  script: () => Step[];
}

/** In teaching order. */
export const TUTORIAL: readonly TutorialLevel[] = [
  { id: "tutorial-summon", make: summon, script: () => summonScript },
  { id: "tutorial-blocked", make: blocked, script: () => blockedScript },
  { id: "tutorial-slots", make: slots, script: () => slotsScript },
  { id: "tutorial-undo", make: undo, script: () => undoScript },
];

export const TUTORIAL_IDS: readonly string[] = TUTORIAL.map((t) => t.id);

export const tutorialById = (id: string): TutorialLevel | null =>
  TUTORIAL.find((t) => t.id === id) ?? null;
