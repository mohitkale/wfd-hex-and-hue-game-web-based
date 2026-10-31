/**
 * The practice save: what a learner has done in the Grimoire, kept on their device apart from the
 * game save (docs/V3_PLAN.md, "Private by default"). Plain data, versioned, and exportable as a
 * file the learner owns. Days are local calendar dates (`YYYY-MM-DD`) passed in by the caller, so
 * this module never reads the clock.
 *
 * Practice days only ever count up: there is no streak to break and nothing is lost for a missed
 * day ("No guilt mechanics").
 *
 * The Path (F8) starts here as its skeleton: every lesson is a node on its branch, and a node is
 * lit once its lesson has been finished.
 */
import { BRANCHES, type Branch, type Lesson, type LessonRun } from "./lesson";

export interface Finished {
  /** The day it was first finished. */
  readonly first: string;
  readonly times: number;
}

export interface PracticeSave {
  readonly version: 1;
  readonly finished: Readonly<Record<string, Finished>>;
  /** Days with any practice, sorted, no repeats. */
  readonly days: readonly string[];
  /** Lessons in progress, to resume where the learner left off. */
  readonly runs: Readonly<Record<string, LessonRun>>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v);
const isId = (k: string) => k !== "" && k !== "__proto__" && k !== "constructor";
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export const emptyPractice = (): PracticeSave => ({ version: 1, finished: {}, days: [], runs: {} });

function isRun(v: unknown, id: string): v is LessonRun {
  if (!isObject(v)) return false;
  const ints = (a: unknown) =>
    Array.isArray(a) && a.every((n) => Number.isInteger(n) && (n as number) >= 0);
  return (
    v.lesson === id &&
    Number.isInteger(v.step) &&
    (v.step as number) >= 0 &&
    ints(v.doneInStep) &&
    ints(v.tries) &&
    typeof v.finished === "boolean"
  );
}

/** Reads anything (a stored value, an imported file) into a valid save, dropping what is broken. */
export function parsePractice(raw: unknown): PracticeSave {
  const save = emptyPractice();
  if (!isObject(raw) || raw.version !== 1) return save;
  const finished: Record<string, Finished> = {};
  if (isObject(raw.finished)) {
    for (const [id, f] of Object.entries(raw.finished)) {
      if (isId(id) && isObject(f) && isDay(f.first) && Number.isInteger(f.times)) {
        if ((f.times as number) >= 1) finished[id] = { first: f.first, times: f.times as number };
      }
    }
  }
  const runs: Record<string, LessonRun> = {};
  if (isObject(raw.runs)) {
    for (const [id, r] of Object.entries(raw.runs)) if (isId(id) && isRun(r, id)) runs[id] = r;
  }
  const days = Array.isArray(raw.days) ? [...new Set(raw.days.filter(isDay))].sort() : [];
  return { ...save, finished, runs, days };
}

export function recordPracticeDay(save: PracticeSave, day: string): PracticeSave {
  if (!isDay(day) || save.days.includes(day)) return save;
  return { ...save, days: [...save.days, day].sort() };
}

/** Stores a lesson in progress (or clears it once finished). */
export function saveRun(save: PracticeSave, run: LessonRun): PracticeSave {
  const runs = { ...save.runs };
  if (run.finished) delete runs[run.lesson];
  else runs[run.lesson] = run;
  return { ...save, runs };
}

/** A lesson finished on `day`: counted, its run cleared, the day marked as a practice day. */
export function recordFinish(save: PracticeSave, lesson: string, day: string): PracticeSave {
  const was = save.finished[lesson];
  const finished = {
    ...save.finished,
    [lesson]: was ? { ...was, times: was.times + 1 } : { first: day, times: 1 },
  };
  const runs = { ...save.runs };
  delete runs[lesson];
  return recordPracticeDay({ ...save, finished, runs }, day);
}

export const practiceDays = (save: PracticeSave) => save.days.length;

export interface BranchProgress {
  readonly branch: Branch;
  /** Lesson ids on the branch, in library order; each a node of the Path. */
  readonly nodes: readonly { readonly id: string; readonly lit: boolean }[];
  readonly lit: number;
  readonly total: number;
}

/** The Path: every branch with its lessons as nodes, lit once finished. Empty branches left out. */
export function pathProgress(
  lessons: readonly Pick<Lesson, "id" | "branch">[],
  save: PracticeSave,
): BranchProgress[] {
  return BRANCHES.map((branch) => {
    const nodes = lessons
      .filter((l) => l.branch === branch)
      .map((l) => ({ id: l.id, lit: Object.hasOwn(save.finished, l.id) }));
    return { branch, nodes, lit: nodes.filter((n) => n.lit).length, total: nodes.length };
  }).filter((b) => b.total > 0);
}

/** The export file's marker, so an unrelated JSON file is refused on import. */
export const PRACTICE_FILE = "hexhue-practice";

export function exportPractice(save: PracticeSave): string {
  return `${JSON.stringify({ file: PRACTICE_FILE, ...save }, null, 2)}\n`;
}

/**
 * Merges another save into this one, so importing never loses practice: days are joined, a lesson
 * keeps its earliest first day and its larger count, and this device's runs win.
 */
export function mergePractice(mine: PracticeSave, theirs: PracticeSave): PracticeSave {
  const finished: Record<string, Finished> = { ...theirs.finished };
  for (const [id, f] of Object.entries(mine.finished)) {
    const t = finished[id];
    finished[id] = t
      ? { first: t.first < f.first ? t.first : f.first, times: Math.max(t.times, f.times) }
      : f;
  }
  const days = [...new Set([...mine.days, ...theirs.days])].sort();
  return { version: 1, finished, days, runs: { ...theirs.runs, ...mine.runs } };
}

export type ImportResult =
  | { readonly ok: true; readonly save: PracticeSave }
  | { readonly ok: false; readonly error: string };

/** Reads an exported file and merges it into `mine`. */
export function importPractice(mine: PracticeSave, text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file could not be read." };
  }
  if (!isObject(raw) || raw.file !== PRACTICE_FILE) {
    return { ok: false, error: "That is not a Hex & Hue practice file." };
  }
  if (raw.version !== 1) {
    return { ok: false, error: "That practice file is from a newer version of Hex & Hue." };
  }
  return { ok: true, save: mergePractice(mine, parsePractice(raw)) };
}
