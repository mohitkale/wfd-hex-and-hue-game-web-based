import { emptyPractice, parsePractice, type PracticeSave } from "@hexhue/learn";

/** Where the practice save lives: this device only, apart from the game save. */
export const PRACTICE_KEY = "hexhue.v3.practice";

type Store = Pick<Storage, "getItem" | "setItem"> | null;

function browserStore(): Store {
  try {
    return window.localStorage;
  } catch {
    return null; // Storage blocked (private mode, settings): practice still works for the visit.
  }
}

export function loadPractice(store: Store = browserStore()): PracticeSave {
  try {
    const raw = store?.getItem(PRACTICE_KEY);
    return raw ? parsePractice(JSON.parse(raw)) : emptyPractice();
  } catch {
    return emptyPractice();
  }
}

/** Saves; false when the device would not keep it. */
export function storePractice(save: PracticeSave, store: Store = browserStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(PRACTICE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** The learner's local calendar date, `YYYY-MM-DD`. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
