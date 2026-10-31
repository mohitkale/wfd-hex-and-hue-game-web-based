/**
 * Lessons: a ritual or practice broken into steps the learner does with their hands (place a tool,
 * light a candle, walk the circle, breathe), each followed by the reason for it. A scene reports
 * what the learner did as an `Action`; `act` answers "right", "already", "try again" (with a gentle
 * hint) or "done". A wrong move costs nothing: it is counted only so the summary can point at the
 * steps worth reading again (docs/V3_PLAN.md, "Learn by doing, then by knowing why").
 */

/** The Path's branches (F8); every lesson belongs to one. */
export const BRANCHES = [
  "elements",
  "moon",
  "herbs-stones",
  "divination",
  "symbols",
  "sabbats",
] as const;
export type Branch = (typeof BRANCHES)[number];

/** What the learner did. Item, spot, path and shape names are ids the lesson and its scene share. */
export type Action =
  | { readonly kind: "place"; readonly item: string; readonly spot: string }
  | { readonly kind: "light"; readonly item: string }
  | { readonly kind: "snuff"; readonly item: string }
  | { readonly kind: "walk"; readonly path: string }
  | { readonly kind: "trace"; readonly shape: string }
  /** A full breath cycle count; more breaths than asked still counts. */
  | { readonly kind: "breathe"; readonly breaths: number }
  | { readonly kind: "choose"; readonly option: string }
  /** A read-and-continue step: the learner taps on. */
  | { readonly kind: "continue" };

export interface Step {
  readonly id: string;
  /** What to do, shown while the step is open. */
  readonly prompt: string;
  /** The actions the step needs, all of them. */
  readonly expects: readonly Action[];
  /** Whether `expects` must be done in the listed order (lighting east, south, west, north). */
  readonly order: "in-order" | "any-order";
  /** Shown after a move the step does not want. Kind, never a telling-off. */
  readonly hint: string;
  /** Why the step matters, shown in the summary. */
  readonly why: string;
}

export interface Lesson {
  readonly id: string;
  readonly title: string;
  readonly branch: Branch;
  /** About how long it takes, for the lesson list. */
  readonly minutes: number;
  readonly intro: string;
  readonly steps: readonly Step[];
}

/** Where a learner is in a lesson. Plain data, so it can be saved and resumed. */
export interface LessonRun {
  readonly lesson: string;
  /** Index of the open step; equals `steps.length` once finished. */
  readonly step: number;
  /** Indices into the open step's `expects` already done. */
  readonly doneInStep: readonly number[];
  /** Moves the step did not want, per step. */
  readonly tries: readonly number[];
  readonly finished: boolean;
}

export type Reply =
  /** The move was wanted; `stepDone` when it completed the step. */
  | { readonly kind: "right"; readonly stepDone: boolean }
  /** The move was wanted earlier in this step and is done already: no progress, no penalty. */
  | { readonly kind: "already" }
  | { readonly kind: "try-again"; readonly hint: string }
  /** The lesson is complete (the move that finished it, or any move after). */
  | { readonly kind: "done" };

export function startLesson(lesson: Lesson): LessonRun {
  return {
    lesson: lesson.id,
    step: 0,
    doneInStep: [],
    tries: lesson.steps.map(() => 0),
    finished: lesson.steps.length === 0,
  };
}

export function sameAction(wanted: Action, got: Action): boolean {
  switch (wanted.kind) {
    case "place":
      return got.kind === "place" && got.item === wanted.item && got.spot === wanted.spot;
    case "light":
    case "snuff":
      return got.kind === wanted.kind && got.item === wanted.item;
    case "walk":
      return got.kind === "walk" && got.path === wanted.path;
    case "trace":
      return got.kind === "trace" && got.shape === wanted.shape;
    case "breathe":
      return got.kind === "breathe" && got.breaths >= wanted.breaths;
    case "choose":
      return got.kind === "choose" && got.option === wanted.option;
    case "continue":
      return got.kind === "continue";
  }
}

/**
 * A saved run checked against the lesson it is resumed on. Lessons change after review, so a run
 * that no longer fits (another lesson, a step or action index past the end, a different number of
 * steps) starts the lesson again rather than leaving the learner stuck.
 */
export function resumeLesson(lesson: Lesson, run: LessonRun): LessonRun {
  const n = lesson.steps.length;
  const step = lesson.steps[run.step];
  const actions = step?.expects.length ?? 0;
  const fits =
    run.lesson === lesson.id &&
    Number.isInteger(run.step) &&
    run.step >= 0 &&
    run.step <= n &&
    run.finished === (run.step === n) &&
    run.tries.length === n &&
    run.tries.every((t) => Number.isInteger(t) && t >= 0) &&
    new Set(run.doneInStep).size === run.doneInStep.length &&
    run.doneInStep.length < Math.max(actions, 1) &&
    run.doneInStep.every((i) => Number.isInteger(i) && i >= 0 && i < actions);
  return fits ? run : startLesson(lesson);
}

/** Applies one move. Never throws on a wrong or late move; the run is returned unchanged then. */
export function act(
  lesson: Lesson,
  saved: LessonRun,
  action: Action,
): { run: LessonRun; reply: Reply } {
  const run = resumeLesson(lesson, saved);
  const step = lesson.steps[run.step];
  if (run.finished || !step) return { run, reply: { kind: "done" } };

  const open = step.expects.map((_, i) => i).filter((i) => !run.doneInStep.includes(i));
  const candidates = step.order === "in-order" ? open.slice(0, 1) : open;
  const hit = candidates.find((i) => sameAction(step.expects[i] as Action, action));

  if (hit === undefined) {
    const wasDone = run.doneInStep.some((i) => sameAction(step.expects[i] as Action, action));
    if (wasDone) return { run, reply: { kind: "already" } };
    const tries = run.tries.map((n, i) => (i === run.step ? n + 1 : n));
    return { run: { ...run, tries }, reply: { kind: "try-again", hint: step.hint } };
  }

  const doneInStep = [...run.doneInStep, hit];
  if (doneInStep.length < step.expects.length) {
    return { run: { ...run, doneInStep }, reply: { kind: "right", stepDone: false } };
  }
  const next = run.step + 1;
  const finished = next >= lesson.steps.length;
  return {
    run: { ...run, step: next, doneInStep: [], finished },
    reply: finished ? { kind: "done" } : { kind: "right", stepDone: true },
  };
}

/** Share of the lesson's actions done, 0…1, for a progress ring. */
export function lessonProgress(lesson: Lesson, saved: LessonRun): number {
  const run = resumeLesson(lesson, saved);
  const total = lesson.steps.reduce((n, s) => n + s.expects.length, 0);
  if (run.finished || total === 0) return 1;
  const before = lesson.steps.slice(0, run.step).reduce((n, s) => n + s.expects.length, 0);
  return Math.min(1, (before + run.doneInStep.length) / total);
}

export interface StepSummary {
  readonly id: string;
  readonly prompt: string;
  readonly why: string;
  /** Moves the step did not want; a step with some is worth reading again. */
  readonly tries: number;
}

/** The "why" page: every step with its reason. */
export function lessonSummary(lesson: Lesson, run: LessonRun): StepSummary[] {
  return lesson.steps.map((s, i) => ({
    id: s.id,
    prompt: s.prompt,
    why: s.why,
    tries: run.tries[i] ?? 0,
  }));
}

/** Structural problems that would make a lesson unplayable or unclear; empty when it is sound. */
export function checkLesson(lesson: Lesson): string[] {
  const problems: string[] = [];
  const at = (s: Step) => `step "${s.id}"`;
  if (!lesson.id.trim()) problems.push("lesson has no id");
  if (!lesson.title.trim()) problems.push("lesson has no title");
  if (!lesson.intro.trim()) problems.push("lesson has no intro");
  if (!BRANCHES.includes(lesson.branch)) problems.push(`unknown branch "${lesson.branch}"`);
  if (!(lesson.minutes > 0)) problems.push("minutes must be more than 0");
  if (lesson.steps.length === 0) problems.push("lesson has no steps");

  const ids = new Set<string>();
  for (const s of lesson.steps) {
    if (!s.id.trim()) problems.push("a step has no id");
    else if (ids.has(s.id)) problems.push(`duplicate step id "${s.id}"`);
    ids.add(s.id);
    for (const field of ["prompt", "hint", "why"] as const) {
      if (!s[field].trim()) problems.push(`${at(s)} has no ${field}`);
    }
    if (s.expects.length === 0) problems.push(`${at(s)} expects nothing`);
    if (s.expects.some((a) => a.kind === "continue") && s.expects.length > 1) {
      problems.push(`${at(s)} mixes "continue" with other actions`);
    }
    if (s.order !== "in-order" && s.order !== "any-order") {
      problems.push(`${at(s)} has an unknown order "${String(s.order)}"`);
    }
    for (const a of s.expects) {
      const ids = Object.entries(a).filter(([k]) => k !== "kind" && k !== "breaths");
      if (ids.some(([, v]) => typeof v !== "string" || !v.trim())) {
        problems.push(`${at(s)} has a ${a.kind} action with a blank name`);
      }
      if (a.kind === "breathe" && !(Number.isInteger(a.breaths) && a.breaths >= 1)) {
        problems.push(`${at(s)} asks for a breath count that is not a whole number of 1 or more`);
      }
    }
    // Two wanted actions that the same move would satisfy can never be told apart.
    const twice = s.expects.some((a, i) =>
      s.expects.slice(i + 1).some((b) => sameAction(a, b) || sameAction(b, a)),
    );
    if (twice) problems.push(`${at(s)} expects the same action twice`);
  }
  return problems;
}
