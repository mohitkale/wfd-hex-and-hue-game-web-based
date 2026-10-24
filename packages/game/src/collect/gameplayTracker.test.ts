import { describe, expect, it, vi } from "vitest";
import { PostHogAnalytics } from "../analytics/providers";
import type { Consent } from "../analytics/consent";
import { GameplayTracker, type Emit } from "./gameplayTracker";

function setup(kind: "tutorial" | "daily" | "picture" | "other" = "picture") {
  const log: { event: string; props: Record<string, unknown> }[] = [];
  const emit: Emit = (event, props) =>
    void log.push({ event, props: props as Record<string, unknown> });
  const t = new GameplayTracker(emit, "moon-1", kind);
  return { t, log, names: () => log.map((e) => e.event) };
}

describe("GameplayTracker", () => {
  it("a played win: start, first move once, then win with counts and active seconds", () => {
    const { t, log, names } = setup();
    t.start();
    t.active(2400);
    t.move();
    t.move();
    t.active(3000);
    t.win();
    expect(names()).toEqual(["play_start", "play_first_move", "play_win"]);
    expect(log[0]!.props).toEqual({ level: "moon-1", kind: "picture", replay: false });
    expect(log[1]!.props).toEqual({ level: "moon-1", seconds: 2 });
    expect(log[2]!.props).toEqual({ level: "moon-1", seconds: 5, moves: 2, undos: 0, boosters: 0 });
  });

  it("a loss, then Retry: loss, retry(after lost) and a new replay attempt with clean counters", () => {
    const { t, log, names } = setup();
    t.start();
    t.move();
    t.active(1000);
    t.loss("slotsFull");
    t.retry("lost");
    t.move();
    t.win();
    expect(names()).toEqual([
      "play_start",
      "play_first_move",
      "play_loss",
      "play_retry",
      "play_start",
      "play_first_move",
      "play_win",
    ]);
    expect(log[2]!.props).toMatchObject({ reason: "slotsFull", moves: 1, seconds: 1 });
    expect(log[3]!.props).toEqual({ level: "moon-1", after: "lost", seconds: 1 });
    expect(log[4]!.props.replay).toBe(true);
    expect(log[6]!.props).toMatchObject({ moves: 1, seconds: 0 });
  });

  it("Retry mid-attempt reports it was still playing", () => {
    const { t, log } = setup();
    t.start();
    t.move();
    t.retry("playing");
    expect(log.find((e) => e.event === "play_retry")!.props.after).toBe("playing");
  });

  it("boosters and undo are counted, with how they were paid for", () => {
    const { t, log } = setup();
    t.start();
    t.undo("owned");
    t.booster("hint", "coins");
    t.booster("extraSlot", "free");
    t.move();
    t.win();
    expect(log.filter((e) => e.event === "play_undo")[0]!.props.paid).toBe("owned");
    expect(log.filter((e) => e.event === "play_booster").map((e) => e.props)).toEqual([
      { level: "moon-1", booster: "hint", paid: "coins" },
      { level: "moon-1", booster: "extraSlot", paid: "free" },
    ]);
    expect(log.at(-1)!.props).toMatchObject({ undos: 1, boosters: 2 });
  });

  it("a loss brought back by Undo or Extra Slot still ends in a counted win", () => {
    const { t, names } = setup();
    t.start();
    t.move();
    t.loss("slotsFull");
    t.booster("extraSlot", "owned");
    t.win();
    expect(names()).toEqual([
      "play_start",
      "play_first_move",
      "play_loss",
      "play_booster",
      "play_win",
    ]);
  });

  it("abandon reports an open attempt once, and never one that has ended", () => {
    const a = setup();
    a.t.start();
    a.t.move();
    a.t.active(4000);
    a.t.abandon();
    a.t.abandon();
    expect(a.names().filter((n) => n === "play_abandon")).toHaveLength(1);
    expect(a.log.at(-1)!.props).toEqual({ level: "moon-1", seconds: 4, moves: 1 });

    const b = setup();
    b.t.start();
    b.t.move();
    b.t.win();
    b.t.abandon();
    expect(b.names()).not.toContain("play_abandon");
  });

  it("time and moves before an attempt starts, or after it ends, are not counted", () => {
    const { t, log } = setup();
    t.active(5000);
    t.move();
    t.start();
    t.move();
    t.win();
    t.active(9000);
    expect(log.at(-1)!.props).toMatchObject({ seconds: 0, moves: 1 });
  });

  it("the 2× ad offer is reported once per level", () => {
    const { t, log } = setup();
    t.adOffer("speed2x", true);
    t.adOffer("speed2x", false);
    expect(log).toEqual([
      { event: "play_ad_offer", props: { level: "moon-1", placement: "speed2x", available: true } },
    ]);
  });

  it("carries no personal data: every property is a plain level id, number, flag or choice", () => {
    const { t, log } = setup("daily");
    t.start();
    t.move();
    t.undo("owned");
    t.booster("hint", "coins");
    t.loss("deadlock");
    t.retry("lost");
    t.adOffer("speed2x", true);
    t.abandon();
    const allowed = new Set([
      "level",
      "kind",
      "replay",
      "seconds",
      "moves",
      "undos",
      "boosters",
      "reason",
      "after",
      "paid",
      "booster",
      "placement",
      "available",
    ]);
    for (const e of log) {
      for (const [k, v] of Object.entries(e.props)) {
        expect(allowed.has(k), `${e.event}.${k}`).toBe(true);
        expect(["string", "number", "boolean"]).toContain(typeof v);
      }
    }
  });
});

describe("consent gate for the gameplay events", () => {
  function through(consent: Consent) {
    const fetch = vi.fn();
    const beacon = vi.fn(() => true);
    const store = new Map<string, string>();
    const ph = new PostHogAnalytics({
      apiKey: "phc_test",
      host: "https://eu.i.posthog.com",
      consent: () => consent,
      fetch,
      beacon,
      storage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => void store.set(k, v),
        removeItem: (k) => void store.delete(k),
      },
      randomId: () => "anon",
    });
    const t = new GameplayTracker((e, p) => ph.track(e, p), "moon-1", "picture");
    t.start();
    t.move();
    t.win();
    t.abandon();
    ph.flush(true);
    return { fetch, beacon, store };
  }

  it.each<Consent>(["unknown", "denied"])(
    "sends nothing and stores no id when consent is %s",
    (c) => {
      const { fetch, beacon, store } = through(c);
      expect(fetch).not.toHaveBeenCalled();
      expect(beacon).not.toHaveBeenCalled();
      expect(store.size).toBe(0);
    },
  );

  it("with consent, sends the events with an anonymous id and no profile or location", () => {
    const { beacon } = through("granted");
    expect(beacon).toHaveBeenCalledTimes(1);
    const body = JSON.parse((beacon.mock.calls[0] as unknown as [string, string])[1]) as {
      batch: { event: string; properties: Record<string, unknown> }[];
    };
    expect(body.batch.map((b) => b.event)).toEqual(["play_start", "play_first_move", "play_win"]);
    for (const b of body.batch) {
      expect(b.properties.distinct_id).toBe("anon");
      expect(b.properties.$geoip_disable).toBe(true);
      expect(b.properties.$process_person_profile).toBe(false);
    }
  });
});
