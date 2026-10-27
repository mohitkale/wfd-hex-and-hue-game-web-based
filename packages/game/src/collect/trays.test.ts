import { describe, expect, it } from "vitest";
import { assignTrays, trayCount } from "./trays";

const g = (id: number, status: string) => ({ id, status });

describe("one row of trays", () => {
  it("holds the working limit plus the waiting limit (and the Extra Slot booster adds one)", () => {
    expect(trayCount(3, 2)).toBe(5);
    expect(trayCount(3, 2 + 1)).toBe(6);
  });

  it("a group leaving its column takes the lowest free tray; groups in columns have none", () => {
    const t = assignTrays(new Map(), [g(0, "working"), g(1, "queued"), g(2, "working")], 5);
    expect([...t]).toEqual([
      [0, 0],
      [2, 1],
    ]);
  });

  it("a box keeps its tray while it works, waits and works again", () => {
    let t = assignTrays(new Map(), [g(0, "working"), g(1, "working"), g(2, "working")], 5);
    expect([...t.values()]).toEqual([0, 1, 2]);
    // 0 stalls and waits, 1 completes, a new group starts: 0 and 2 stay put, the new one takes tray 1.
    t = assignTrays(t, [g(0, "waiting"), g(1, "completed"), g(2, "working"), g(3, "working")], 5);
    expect(t.get(0)).toBe(0);
    expect(t.get(2)).toBe(2);
    expect(t.get(3)).toBe(1);
    expect(t.has(1)).toBe(false);
    // 0 resumes in the same tray.
    t = assignTrays(t, [g(0, "working"), g(2, "working"), g(3, "working")], 5);
    expect(t.get(0)).toBe(0);
  });

  it("a valid game always finds a tray: working plus waiting never exceeds the trays", () => {
    // fieldCap 3 + slots 2: three working and two waiting fill all five, each in its own tray.
    const groups = [
      g(0, "working"),
      g(1, "working"),
      g(2, "working"),
      g(3, "waiting"),
      g(4, "waiting"),
    ];
    const t = assignTrays(new Map(), groups, trayCount(3, 2));
    expect(new Set(t.values()).size).toBe(5);
    expect([...t.values()].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("never lets two groups share a tray, even from a stale assignment", () => {
    const t = assignTrays(
      new Map([
        [0, 1],
        [1, 1],
      ]),
      [g(0, "working"), g(1, "working")],
      3,
    );
    expect(new Set(t.values()).size).toBe(2);
  });

  it("a stale tray beyond the new count is reassigned; extras beyond capacity are left out", () => {
    const t = assignTrays(
      new Map([[0, 7]]),
      [g(0, "working"), g(1, "working"), g(2, "working")],
      2,
    );
    expect([...t.values()].sort()).toEqual([0, 1]);
    expect(t.size).toBe(2);
  });

  it("an undo or a restart (a fresh state) starts from the lowest trays again", () => {
    const t = assignTrays(new Map([[5, 4]]), [g(0, "working")], 5);
    expect(t.get(0)).toBe(0);
  });
});
