import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { createRewards, MockProvider, NoneProvider } from "../rewards";
import {
  applyAdResult,
  enterLevel,
  initialSpeedState,
  restoreSpeed,
  speedView,
  type SpeedState,
} from "./speedRule";
import { SHOWN_TICKS_PER_SECOND, TickClock } from "./tickClock";
import { stepFrame } from "./frameStep";
import { targetRect } from "./TutorialLayer";
import { activeColumnRects, computeCollectLayout, hudButtonX } from "./collectLayout";
import { ART_LEVELS } from "./artLevels";
import { TUTORIAL } from "./tutorialLevels";
import { moonlitHat } from "./slice";

/** M14.3: 1× is free; 3× only through an optional rewarded ad, for one level; and it never changes outcomes. */

const view = (state: SpeedState, over: Partial<Parameters<typeof speedView>[0]> = {}) =>
  speedView({ levelId: "L", state, providerAvailable: true, speed: 1, ...over });

describe("what the HUD offers", () => {
  it("with no working provider there is no 3× offer at all", () => {
    expect(view(initialSpeedState(), { providerAvailable: false })).toEqual({
      show: false,
      label: "",
      action: "none",
    });
  });

  it("with a provider the offer says it is an ad, and a tap watches it", () => {
    expect(view(initialSpeedState())).toEqual({ show: true, label: "3×▶", action: "watch" });
  });

  it("while an ad is on screen the button says so, and a tap on it ends the wait (a provider that hangs never traps the game)", () => {
    expect(view({ ...initialSpeedState(), adPending: true })).toEqual({
      show: true,
      label: "…",
      action: "cancel",
    });
  });

  it("once unlocked it is a plain 1×/3× switch, even if the provider goes away", () => {
    const s: SpeedState = { unlockedFor: "L", declinedFor: null, adPending: false };
    expect(view(s, { speed: 3, providerAvailable: false })).toEqual({
      show: true,
      label: "3×",
      action: "toggle",
    });
    expect(view(s, { speed: 1 }).label).toBe("1×");
  });

  it("3× unlocked for another level does not carry over: here the ad is offered again", () => {
    const s: SpeedState = { unlockedFor: "other", declinedFor: null, adPending: false };
    expect(view(s).action).toBe("watch");
  });
});

describe("what an ad's result does", () => {
  it("a completed ad unlocks 3× for this level and says so", () => {
    const out = applyAdResult(initialSpeedState(), "L", "rewarded");
    expect(out.speed).toBe(3);
    expect(out.state.unlockedFor).toBe("L");
    expect(out.message).toBe("3× unlocked for this level");
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

  it("no fake reward: only `rewarded` ever gives 3×", () => {
    for (const r of ["dismissed", "unavailable"] as const)
      expect(applyAdResult(initialSpeedState(), "L", r).speed).toBe(1);
  });
});

describe("3× is for the current level only", () => {
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
  it("PUBLIC_REWARDS=none (and an unset production build) advertises no 3×", () => {
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
    const clock = new TickClock(SHOWN_TICKS_PER_SECOND);
    let next = 0;
    let frames = 0;
    for (; frames < 400_000 && session.state.status === "playing"; frames++) {
      if (next < line.length && collect.isSettled(session.state)) {
        expect(session.tap(line[next]!).ok).toBe(true);
        next++;
      }
      stepFrame(session, clock, 1000 / 60, speed);
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
    "%s: the same actions give the same log, state and win at 1× and 3×",
    (_id, level) => {
      const solved = collect.solve(level, 200_000);
      expect(solved.status).toBe("solved");
      const one = play(level, solved.line!, 1);
      const two = play(level, solved.line!, 3);
      expect(one.session.state.status).toBe("won");
      expect(two.session.state.status).toBe("won");
      expect(two.session.log).toEqual(one.session.log);
      expect(collect.hashState(two.session.state)).toBe(collect.hashState(one.session.state));
      // It really was faster: about a third of the frames.
      expect(two.frames).toBeLessThan(one.frames * 0.5);
    },
    120_000,
  );
});

describe("the level's speed when it starts", () => {
  const unlocked: SpeedState = { unlockedFor: "L", declinedFor: null, adPending: true };

  it("restores 3× only for the very level it was unlocked for, and never an ad in flight", () => {
    expect(restoreSpeed(unlocked, 3, "L", false)).toEqual({
      state: { unlockedFor: "L", declinedFor: null, adPending: false },
      speed: 3,
    });
    // Unlocked but switched back to 1×, or kept speed from another level: 1×.
    expect(restoreSpeed(unlocked, 1, "L", false).speed).toBe(1);
    expect(restoreSpeed(unlocked, 3, "M", false)).toEqual({ state: initialSpeedState(), speed: 1 });
    expect(restoreSpeed(undefined, undefined, "L", false)).toEqual({
      state: initialSpeedState(),
      speed: 1,
    });
    expect(restoreSpeed(initialSpeedState(), 3, "L", false).speed).toBe(1); // a stale 3 never unlocks
  });

  it("the review override unlocks the level it opens (and only when the caller says it is allowed)", () => {
    expect(restoreSpeed(undefined, undefined, "L", true)).toEqual({
      state: { unlockedFor: "L", declinedFor: null, adPending: false },
      speed: 3,
    });
    expect(restoreSpeed(undefined, undefined, "L", false).speed).toBe(1);
  });
});

describe("the frame step the scene really runs", () => {
  it("does nothing, and lets no time build up, while an ad is on screen", () => {
    const level = TUTORIAL[0]!.make();
    const session = new collect.CollectSession(level);
    session.tap({ kind: "select", column: 0 });
    const clock = new TickClock(SHOWN_TICKS_PER_SECOND);
    for (let i = 0; i < 600; i++) expect(stepFrame(session, clock, 16.7, 2, true)).toBe(0);
    expect(session.state.tick).toBe(0);
    // Afterwards play resumes normally, with no burst of ticks for the time that passed.
    const first = stepFrame(session, clock, 16.7, 1, false);
    expect(first).toBeLessThanOrEqual(1);
  });
});

describe("the Undo ring on the HUD", () => {
  it("is on the first of the three fixed HUD slots, so undo and retry never move", () => {
    const l = computeCollectLayout({
      width: 750,
      height: 1500,
      dpr: 2,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      boardWidth: 10,
      boardHeight: 10,
      slots: 3,
      columns: 3,
      fieldCap: 3,
      portalX: 4,
    });
    const r = targetRect(l, { kind: "undo" })!;
    const slot0 = hudButtonX(l, 0, 3);
    expect(r.x + r.w / 2).toBeCloseTo(slot0);
  });
});

describe("the tutorial's ring follows the columns as they centre", () => {
  it("points at where a column is now, not where it started", () => {
    const l = computeCollectLayout({
      width: 750,
      height: 1500,
      dpr: 2,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      boardWidth: 10,
      boardHeight: 10,
      slots: 3,
      columns: 2,
      fieldCap: 3,
      portalX: 4,
    });
    // By default the ring is on the column's own rect.
    expect(targetRect(l, { kind: "column", index: 1 })).toEqual(l.columns[1]);
    // Column 0 ran out: column 1 slides to the middle, and the ring goes with it.
    const now = activeColumnRects(l, [false, true]);
    const r = targetRect(l, { kind: "column", index: 1 }, 3, (i) => now[i] ?? null)!;
    expect(r.x).toBe(now[1]!.x);
    expect(r.x).not.toBe(l.columns[1]!.x);
    expect(Math.abs(r.x + r.w / 2 - (l.frame.x + l.frame.w / 2))).toBeLessThanOrEqual(1);
    // A column with nothing left is pointed at by nothing.
    expect(targetRect(l, { kind: "column", index: 0 }, 3, (i) => now[i] ?? null)).toBeNull();
  });
});

describe("the tutorial's ring points at the tray a waiting box sits in", () => {
  it("uses the tray the box is in, not the engine slot number", () => {
    const l = computeCollectLayout({
      width: 750,
      height: 1500,
      dpr: 2,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      boardWidth: 10,
      boardHeight: 10,
      slots: 2,
      columns: 3,
      fieldCap: 3,
      portalX: 4,
    });
    // By default slot i is tray i; a box in engine slot 0 that sits in tray 2 is pointed at there.
    expect(targetRect(l, { kind: "slot", index: 0 })).toEqual(l.trays[0]);
    const r = targetRect(l, { kind: "slot", index: 0 }, 3, undefined, () => l.trays[2] ?? null);
    expect(r).toEqual(l.trays[2]);
    expect(targetRect(l, { kind: "slot", index: 1 }, 3, undefined, () => null)).toBeNull();
  });
});
