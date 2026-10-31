import { emptyPractice, recordFinish } from "@hexhue/learn";
import { describe, expect, it } from "vitest";
import { PRACTICE_KEY, loadPractice, localDay, storePractice } from "./practiceStore";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe("practice store", () => {
  it("round-trips a save under its own key", () => {
    const store = memory();
    const save = recordFinish(emptyPractice(), "four-elements", "2026-11-01");
    expect(storePractice(save, store)).toBe(true);
    expect([...store.data.keys()]).toEqual([PRACTICE_KEY]);
    expect(loadPractice(store)).toEqual(save);
  });

  it("never throws on broken or blocked storage", () => {
    const store = memory();
    store.data.set(PRACTICE_KEY, "{broken");
    expect(loadPractice(store)).toEqual(emptyPractice());
    expect(loadPractice(null)).toEqual(emptyPractice());
    expect(storePractice(emptyPractice(), null)).toBe(false);
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(storePractice(emptyPractice(), full)).toBe(false);
  });

  it("formats the local calendar day", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
