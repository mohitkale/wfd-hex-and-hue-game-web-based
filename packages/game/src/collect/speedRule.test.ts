import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { createRewards, MockProvider, NoneProvider } from "../rewards";
import {
  applyAdResult,
  enterLevel,
  initialSpeedState,
  speedView,
  type SpeedState,
} from "./speedRule";
import { TickClock } from "./tickClock";
import { ART_LEVELS } from "./artLevels";
import { TUTORIAL } from "./tutorialLevels";
import { moonlitHat } from "./slice";

/** M14.3: 1× is free; 2× only through an optional rewarded ad, for one level; and it never changes outcomes. */

const view = (state: SpeedState, over: Partial<Parameters<typeof speedView>[0]> = {}) =>
  speedView({ levelId: "L", state, providerAvailable: true, speed: 1, ...over });

describe("what the HUD offers", () => {
  it("with no working provider there is no 2× offer at all", () => {
    expect(view(initialSpeedState(), { providerAvailable: false })).toEqual({
      show: false,
      label: "",
      action: "none",
    });
  });

  it("with a provider the offer says it is an ad, and a tap watches it", () => {
    expect(view(initialSpeedState())).toEqual({ show: true, label: "2×▶", action: "watch" });
  });

  it("while an ad is on screen the button is busy and takes no taps", () => {
    expect(view({ ...initialSpeedState(), adPending: true })).toEqual({
      show: true,
      label: "…",
      action: "none",
    });
  });

  it("once unlocked it is a plain 1×/2× switch, even if the provider goes away", () => {
    const s: SpeedState = { unlockedFor: "L", declinedFor: null, adPending: false };
    expect(view(s, { speed: 2, providerAvailable: false })).toEqual({
      show: true,
      label: "2×",
      action: "toggle",
    });
    expect(view(s, { speed: 1 }).label).toBe("1×");
  });

  it("2× unlocked for another level offers nothing extra here: the offer is the ad again", () => {
    const s: SpeedState = { unlockedFor: "other", declinedFor: null, adPending: false };
    expect(view(s).action).toBe("watch");
  });
});

describe("what an ad's result does", () => {
  it("a completed ad unlocks 2× for this level and says so", () => {
    const out = applyAdResult(initialSpeedState(), "L", "rewarded");
    expect(out.speed).toBe(2);
    expect(out.state.unlockedFor).toBe("L");
    expect(out.message).toBe("2× unlocked for this level");
  });

  it("closing it early grants nothing, changes nothing and may be tried again", () => {
    const out = applyAdResult({ ...initialSpeedState(), adPending: true }, "L", "dismissed");
    expect(out.speed).toBe(1);
    expect(out.state).toEqual(initialSpeedState());
    expect(out.message).toBeNull();
    expect(view(out.state).action).toBe("watch");
  });

  it("an ad that cannot be shown withdraws the offer for this level, with a plain message, and play goes on at 1×", () => {
    const out = applyAdResult({ ...initialSpeedState(), adPending: true }, "L", "unavailable");
    expect(out.speed).toBe(1);
    expect(out.state.unlockedFor).toBeNull();
    expect(out.message).toBe("No ad right now. Playing at 1×");
    expect(view(out.state).show).toBe(false);
  });

  it("no fake reward: only `rewarded` ever gives 2×", () => {
    for (const r of ["dismissed", "unavailable"] as const)
      expect(applyAdResult(initialSpeedState(), "L", r).speed).toBe(1);
  });
});

describe("2× is for the current level only", () => {
  it("another level starts at 1× with the offer back; the same level keeps it (a retry)", () => {
    const unlocked: SpeedState = { unlockedFor: "L", declinedFor: null, adPending: true };
    expect(enterLevel(unlocked, "L")).toEqual({
      unlockedFor: "L",
      declinedFor: null,
      adPending: false,
    });
    expect(enterLevel(unlocked, "M")).toEqual(initialSpeedState());
    const declined: SpeedState = { unlockedFor: null, declinedFor: "L", adPending: false };
    expect(enterLevel(declined, "L").declinedFor).toBe("L");
    expect(enterLevel(declined, "M").declinedFor).toBeNull();
  });
});

describe("the provider decides whether anything is offered", () => {
  it("PUBLIC_REWARDS=none (and an unset production build) advertises no 2×", () => {
    for (const env of [
      { PUBLIC_REWARDS: "none" },
      { DEV: false },
      { PUBLIC_REWARDS: "none", DEV: true },
    ]) {
      const p = createRewards(env);
      expect(p).toBeInstanceOf(NoneProvider);
      expect(view(initialSpeedState(), { providerAvailable: p.isAvailable("speed2x") }).show).toBe(
        false,
      );
    }
  });

  it("the mock is labelled as one (and is only the default in development)", () => {
    expect(createRewards({ DEV: true })).toBeInstanceOf(MockProvider);
    expect(new MockProvider().name).toBe("mock");
  });
});

describe("speed never changes the outcome", () => {
  /** Plays `line` at `speed`: frames of ~16.7 ms feed a TickClock; each action is tapped as soon as the board is settled. */
  function play(level: collect.CollectLevel, line: readonly collect.Action[], speed: number) {
    const session = new collect.CollectSession(level);
    const clock = new TickClock();
    let next = 0;
    let frames = 0;
    for (; frames < 400_000 && session.state.status === "playing"; frames++) {
      if (next < line.length && collect.isSettled(session.state)) {
        expect(session.tap(line[next]!).ok).toBe(true);
        next++;
      }
      const due = clock.advance(1000 / 60, speed);
      for (let i = 0; i < due; i++) session.tick();
      if (due === 0 && collect.isSettled(session.state)) clock.drain();
    }
    return { session, frames };
  }

  const levels: collect.CollectLevel[] = [
    ...TUTORIAL.map((t) => t.make()),
    ...Object.values(ART_LEVELS)
      .slice(0, 2)
      .map((make) => make()),
    moonlitHat(),
  ];

  it.each(levels.map((l) => [l.id, l] as const))(
    "%s: the same actions give the same log, state and win at 1× and 2×",
    (_id, level) => {
      const solved = collect.solve(level, 200_000);
      expect(solved.status).toBe("solved");
      const one = play(level, solved.line!, 1);
      const two = play(level, solved.line!, 2);
      expect(one.session.state.status).toBe("won");
      expect(two.session.state.status).toBe("won");
      expect(two.session.log).toEqual(one.session.log);
      expect(collect.hashState(two.session.state)).toBe(collect.hashState(one.session.state));
      // It really was faster: about half the frames.
      expect(two.frames).toBeLessThan(one.frames * 0.7);
    },
    120_000,
  );
});
