import * as collect from "@hexhue/core/collect";
import { Tutorial, type Step, type Target } from "./tutorial";
import { withSharedTrays } from "./trayRules";

/**
 * The three tutorial levels (M14.2, docs/V2_ONBOARDING.md), each tiny, each teaching one thing and
 * each solver-verified: summon and watch, a buried colour, and a box that waits in its tray. They play
 * by the same rules as the game (every tray works, `withSharedTrays`, M15.13); the Undo lesson went
 * with Undo itself (owner decision). Their hints are scripts over the game state (`tutorial.ts`).
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

/** A lesson's level as the game plays it. */
const played = (make: () => collect.CollectLevel) => () => withSharedTrays(make());

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

/** 2. A buried colour: red cannot be reached until the blue around it is gone; it waits meanwhile. */
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
    // It cannot work yet, so it waits in a tray (a tap is never refused while a tray is free).
    done: ({ state }) => started(state, 1) || started(state, 0),
  },
  {
    id: "clear-blue",
    text: "It waits. Clear the blue",
    target: () => col(1),
    // Red then wakes by itself, so there is no third tap to teach.
    done: ({ state }) => started(state, 0),
  },
];

/** 3. Slots: a group with nothing left to reach waits in its tray, and wakes by itself when it can. */
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
    text: "It waits. Blue wakes it",
    // Once red really waits in a tray; the blue column is what to tap, and red wakes by itself.
    target: () => col(2),
    ready: (s) => firstWaiting(s) >= 0,
    // Or the player cleared the blue first and red never had to wait: the lesson moves on.
    done: ({ state }) => started(state, 0) || state.groups[0]!.status === "completed" || won(state),
  },
];

/** A machine for a tutorial level; `skipped` ones show nothing (Skip is for the whole visit). */
export function createTutorial(id: string, skipped = false): Tutorial | null {
  const t = tutorialById(id);
  if (!t) return null;
  const machine = new Tutorial(t.script());
  if (skipped) machine.skip();
  return machine;
}

export interface TutorialLevel {
  id: string;
  make: () => collect.CollectLevel;
  script: () => Step[];
}

/** In teaching order. */
export const TUTORIAL: readonly TutorialLevel[] = [
  { id: "tutorial-summon", make: played(summon), script: () => summonScript },
  { id: "tutorial-blocked", make: played(blocked), script: () => blockedScript },
  { id: "tutorial-slots", make: played(slots), script: () => slotsScript },
];

export const TUTORIAL_IDS: readonly string[] = TUTORIAL.map((t) => t.id);

export const tutorialById = (id: string): TutorialLevel | null =>
  TUTORIAL.find((t) => t.id === id) ?? null;
