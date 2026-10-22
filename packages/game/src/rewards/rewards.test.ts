import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockProvider, NoneProvider, createRewards, safeShow } from "./providers";
import { speedOffer, unlockSpeed } from "./speed";
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
