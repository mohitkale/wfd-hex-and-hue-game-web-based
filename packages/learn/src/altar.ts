/**
 * The altar (F1, Ritual Rehearsal): the board a lesson is rehearsed on. A layout names the spots on
 * the altar cloth, the tools in the tray, the candles already standing there and the strokes a
 * learner can trace; the scene (apps/web/src/altar) draws it and turns gestures into the lesson's
 * `Action`s. What stands where, what burns and which circles were walked is never stored: it is
 * replayed from the lesson and the run, so a resumed lesson shows the altar exactly as it was left.
 */
import type { Action, Lesson, LessonRun } from "./lesson";

/** Pixel icons the scene can draw for a tool (apps/web/src/altar/icons.ts). */
export const ICONS = [
  "feather",
  "candle",
  "chalice",
  "stone",
  "bell",
  "wand",
  "bowl",
  "plate",
  "oil",
  "sprig",
  "snuffer",
  "salt",
] as const;
export type Icon = (typeof ICONS)[number];

export interface AltarSpot {
  readonly id: string;
  readonly label: string;
  /** Position on the altar cloth, 0…1 across and down (north at the top). */
  readonly x: number;
  readonly y: number;
}

export interface AltarTool {
  readonly id: string;
  readonly label: string;
  readonly icon: Icon;
  /** Candle wax colour (`#rrggbb`) for candle icons. */
  readonly color?: string;
}

/** A candle already standing on the altar when the lesson starts. */
export interface AltarCandle {
  readonly id: string;
  readonly spot: string;
  readonly color: string;
}

/** A stroke the learner draws over a spot, in one direction (dressing a candle with oil). */
export interface AltarTrace {
  readonly id: string;
  readonly spot: string;
  readonly direction: "up" | "down" | "left" | "right";
  readonly label: string;
}

/** Circles walked with a finger round the altar: sunwise (clockwise on the cloth) or widdershins. */
export const WALKS = ["sunwise", "widdershins"] as const;
export type Walk = (typeof WALKS)[number];

export interface AltarLayout {
  readonly spots: readonly AltarSpot[];
  /** The tray: tools to drag onto spots, decoys included. */
  readonly tools: readonly AltarTool[];
  readonly candles?: readonly AltarCandle[];
  readonly traces?: readonly AltarTrace[];
}

export interface AltarState {
  /** Spot id → tool id standing there. */
  readonly placed: Readonly<Record<string, string>>;
  /** Tools and candles burning now. */
  readonly lit: readonly string[];
  readonly walked: readonly Walk[];
}

/** Every action done so far in a run, in the order the lesson lists them. */
export function doneActions(lesson: Lesson, run: LessonRun): Action[] {
  const done: Action[] = lesson.steps.slice(0, run.step).flatMap((s) => [...s.expects]);
  const open = lesson.steps[run.step];
  if (open) for (const i of run.doneInStep) done.push(open.expects[i] as Action);
  return done;
}

/** The altar as the run left it. */
export function altarState(lesson: Lesson, run: LessonRun): AltarState {
  const placed: Record<string, string> = {};
  const lit = new Set<string>();
  const walked: Walk[] = [];
  for (const a of doneActions(lesson, run)) {
    if (a.kind === "place") {
      for (const [spot, item] of Object.entries(placed)) if (item === a.item) delete placed[spot];
      placed[a.spot] = a.item;
    } else if (a.kind === "light") lit.add(a.item);
    else if (a.kind === "snuff") lit.delete(a.item);
    else if (a.kind === "walk" && (WALKS as readonly string[]).includes(a.path)) {
      walked.push(a.path as Walk);
    }
  }
  return { placed, lit: [...lit], walked };
}

/** Problems that would leave a step impossible to do on this altar; empty when it is playable. */
export function checkAltar(lesson: Lesson, altar: AltarLayout): string[] {
  const problems: string[] = [];
  const spots = new Set(altar.spots.map((s) => s.id));
  const tools = new Set(altar.tools.map((t) => t.id));
  const candles = new Set((altar.candles ?? []).map((c) => c.id));
  const traces = new Set((altar.traces ?? []).map((t) => t.id));
  const dup = (kind: string, ids: readonly string[]) => {
    if (new Set(ids).size !== ids.length) problems.push(`altar has duplicate ${kind} ids`);
  };
  dup(
    "spot",
    altar.spots.map((s) => s.id),
  );
  dup("tool", [...altar.tools.map((t) => t.id), ...candles]);
  dup(
    "trace",
    (altar.traces ?? []).map((t) => t.id),
  );
  for (const s of altar.spots) {
    if (!(s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1)) {
      problems.push(`spot "${s.id}" is off the altar`);
    }
  }
  for (const c of altar.candles ?? []) {
    if (!spots.has(c.spot)) problems.push(`candle "${c.id}" stands on unknown spot "${c.spot}"`);
  }
  for (const t of altar.traces ?? []) {
    if (!spots.has(t.spot)) problems.push(`trace "${t.id}" is on unknown spot "${t.spot}"`);
  }
  for (const s of lesson.steps) {
    const at = `step "${s.id}"`;
    for (const a of s.expects) {
      if (a.kind === "place") {
        if (!tools.has(a.item)) problems.push(`${at} places "${a.item}", not in the tray`);
        if (!spots.has(a.spot)) problems.push(`${at} uses unknown spot "${a.spot}"`);
      } else if (a.kind === "light" || a.kind === "snuff") {
        const known = tools.has(a.item) || candles.has(a.item);
        if (!known) problems.push(`${at} ${a.kind}s "${a.item}", not on the altar`);
      } else if (a.kind === "trace") {
        if (!traces.has(a.shape)) problems.push(`${at} traces unknown "${a.shape}"`);
      } else if (a.kind === "walk") {
        if (!(WALKS as readonly string[]).includes(a.path)) {
          problems.push(`${at} walks "${a.path}"; walks are sunwise or widdershins`);
        }
      }
    }
  }
  return problems;
}
