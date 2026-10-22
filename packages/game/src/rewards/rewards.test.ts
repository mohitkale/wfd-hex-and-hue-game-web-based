import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockProvider, NoneProvider, createRewards, safeShow } from "./providers";
import { speedButton, speedOffer, unlockSpeed } from "./speed";
import type { AdResult, RewardsProvider } from "./types";

const fake = (available: boolean, result: AdResult): RewardsProvider => ({
  name: "fake",
  isAvailable: () => available,
  show: vi.fn(async () => result),
});

describe("speed policy", () => {
  it("alternates free and ad turns", () => {
    expect([0, 1, 2, 3].map(speedOffer)).toEqual(["free", "ad", "free", "ad"]);
  });

  it("free turn: granted without an ad, next is an ad turn", async () => {
    const p = fake(true, "rewarded");
    expect(await unlockSpeed(0, p)).toEqual({ granted: true, turns: 1 });
    expect(p.show).not.toHaveBeenCalled();
  });

  it("ad turn: watching grants; closing changes nothing", async () => {
    expect(await unlockSpeed(1, fake(true, "rewarded"))).toEqual({ granted: true, turns: 2 });
    expect(await unlockSpeed(1, fake(true, "dismissed"))).toEqual({ granted: false, turns: 1 });
  });

  it("ad turn with no ad: stays 1×, and the next unlock is free", async () => {
    const none = await unlockSpeed(1, new NoneProvider());
    expect(none.granted).toBe(false);
    expect(speedOffer(none.turns)).toBe("free");
    expect(none.message).toMatch(/free next level/);
    expect((await unlockSpeed(1, fake(true, "unavailable"))).turns).toBe(2);
  });
});

describe("providers", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("none never offers or shows", async () => {
    const p = new NoneProvider();
    expect(p.isAvailable()).toBe(false);
    expect(await p.show()).toBe("unavailable");
  });

  it("picks mock in dev, none in production, unless configured", () => {
    expect(createRewards({ DEV: true }).name).toBe("mock");
    expect(createRewards({ DEV: false }).name).toBe("none");
    expect(createRewards({ DEV: true, PUBLIC_REWARDS: "none" }).name).toBe("none");
    expect(createRewards({ DEV: false, PUBLIC_REWARDS: "mock" }).name).toBe("mock");
  });

  it("mock is unavailable without a document", async () => {
    const p = new MockProvider(3, null);
    expect(p.isAvailable("coins")).toBe(false);
    expect(await p.show("coins")).toBe("unavailable");
  });

  it("safeShow turns hangs and errors into unavailable", async () => {
    const hang: RewardsProvider = {
      name: "h",
      isAvailable: () => true,
      show: () => new Promise(() => {}),
    };
    const pending = safeShow(hang, "coins", 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBe("unavailable");
    const boom: RewardsProvider = {
      name: "b",
      isAvailable: () => true,
      show: () => Promise.reject(new Error("sdk crashed")),
    };
    expect(await safeShow(boom, "coins")).toBe("unavailable");
  });
});

describe("speed button", () => {
  const base = { unlocked: false, declined: false, speed: 1 as const, turns: 0, adAvailable: true };

  it("offers free, then ad, and toggles once unlocked", () => {
    expect(speedButton(base)).toEqual({ label: "2× free", action: "unlock" });
    expect(speedButton({ ...base, turns: 1 })).toEqual({ label: "2× ▶", action: "unlock" });
    expect(speedButton({ ...base, unlocked: true, speed: 2 })).toEqual({
      label: "2×",
      action: "toggle",
    });
  });

  it("never advertises an ad that can't play", () => {
    expect(speedButton({ ...base, turns: 1, adAvailable: false }).label).toBe("2×");
  });

  it("after an empty ad turn, stays 1× for the rest of the level (no same-level free 2×)", async () => {
    const outcome = await unlockSpeed(1, new NoneProvider());
    // The counter moved on to a free turn…
    expect(speedOffer(outcome.turns)).toBe("free");
    // …but this level is declined, so the button only explains.
    expect(speedButton({ ...base, turns: outcome.turns, declined: true })).toEqual({
      label: "1×",
      action: "explain",
    });
  });
});

/** A just-enough DOM for MockProvider. */
function fakeDocument() {
  const nodes: { removed: boolean; listeners: Record<string, () => void>; children: unknown[] }[] =
    [];
  const make = () => {
    const node = {
      removed: false,
      listeners: {} as Record<string, () => void>,
      children: [] as unknown[],
      style: { cssText: "" },
      textContent: "",
      setAttribute() {},
      append(...c: unknown[]) {
        node.children.push(...c);
      },
      remove() {
        node.removed = true;
      },
      addEventListener(type: string, fn: () => void) {
        node.listeners[type] = fn;
      },
    };
    nodes.push(node);
    return node;
  };
  const doc = { createElement: make, body: { append() {} } } as unknown as Document;
  return { doc, nodes };
}

describe("MockProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("rewards after the countdown and removes its overlay", async () => {
    const { doc, nodes } = fakeDocument();
    const shown = new MockProvider(3, doc).show("coins");
    await vi.advanceTimersByTimeAsync(3000);
    expect(await shown).toBe("rewarded");
    expect(nodes[0]!.removed).toBe(true);
  });

  it("closing early is a dismissal", async () => {
    const { doc, nodes } = fakeDocument();
    const shown = new MockProvider(3, doc).show("coins");
    await vi.advanceTimersByTimeAsync(1000);
    nodes[2]!.listeners.click!(); // the Close button
    expect(await shown).toBe("dismissed");
    expect(nodes[0]!.removed).toBe(true);
  });
});
