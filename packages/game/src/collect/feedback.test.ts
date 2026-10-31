import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { AudioEngine, type AudioLike } from "../audio";
import { planCues, playCues, rejectionCue, type Cue } from "./cues";
import { Emitter, Particles } from "./particles";
import { PENTATONIC, soundSpec } from "../audio/sounds";
import { bump, leaveScale, squashX, squashY } from "./swarm";

type Ev = collect.CollectEvent;

const delivered = (group: number, remaining: number): Ev => ({
  type: "cubeDelivered",
  familiar: group,
  group,
  color: 0,
  remaining,
});
const picked: Ev = { type: "cubePickedUp", familiar: 1, cube: 4, color: 0 };

describe("sound and vibration are planned from events", () => {
  it("an empty or quiet batch plays nothing", () => {
    expect(planCues([])).toEqual([]);
    expect(
      planCues([{ type: "familiarMoved", familiar: 0, from: 1, to: 2, carrying: false, at: 1 }]),
    ).toEqual([]);
  });

  it("each decision has its own cue", () => {
    expect(planCues([{ type: "groupSelected", group: 0, column: 0 }])).toEqual([
      { sound: "tap", haptic: "tap" },
    ]);
    expect(planCues([{ type: "groupResumed", group: 0, slot: 0 }])).toEqual([
      { sound: "launch", haptic: "tap" },
    ]);
    expect(planCues([{ type: "groupParked", group: 0, slot: 0, remaining: 1 }])).toEqual([
      { sound: "park", haptic: "park" },
    ]);
    expect(planCues([{ type: "lost", reason: "deadlock", group: null }])).toEqual([
      { sound: "lose", haptic: "lose" },
    ]);
  });

  it("many pickups in one tick make one pop, and many deliveries one note: the highest", () => {
    const cues = planCues([
      picked,
      picked,
      picked,
      delivered(0, 5),
      delivered(1, 1),
      delivered(2, 3),
    ]);
    expect(cues.filter((c) => c.sound === "pickup")).toEqual([{ sound: "pickup" }]);
    expect(cues.filter((c) => c.sound === "collect")).toEqual([
      { sound: "collect", options: { chargeLeft: 1 }, haptic: "collect" },
    ]);
  });

  it("emptying a group plays a rising run: each delivery is a higher note than the last", () => {
    const freqs = [9, 5, 3, 2, 1, 0].map((n) => {
      const cue = planCues([delivered(0, n)])[0]!;
      return soundSpec(cue.sound, cue.options)[0]!.freq;
    });
    for (let i = 1; i < freqs.length; i++) expect(freqs[i]!).toBeGreaterThan(freqs[i - 1]!);
    expect(freqs.at(-1)).toBe(PENTATONIC.at(-1));
  });

  it("when two groups deliver in one tick, the one closest to finishing is heard, whatever the order", () => {
    const a = planCues([delivered(0, 2), delivered(1, 7)]).find((c) => c.sound === "collect");
    const b = planCues([delivered(1, 7), delivered(0, 2)]).find((c) => c.sound === "collect");
    expect(a?.options).toEqual({ chargeLeft: 2 });
    expect(b?.options).toEqual({ chargeLeft: 2 });
    // Equal remaining: still exactly one note.
    expect(
      planCues([delivered(0, 4), delivered(1, 4)]).filter((c) => c.sound === "collect"),
    ).toHaveLength(1);
  });

  it("a light delivery tick never cancels a stronger vibration in the same batch", () => {
    const park = planCues([
      { type: "groupParked", group: 0, slot: 0, remaining: 1 },
      delivered(1, 3),
    ]);
    expect(park.filter((c) => c.haptic).map((c) => c.haptic)).toEqual(["park"]);
    const lose = planCues([delivered(1, 3), { type: "lost", reason: "slotsFull", group: 0 }]);
    expect(lose.filter((c) => c.haptic).map((c) => c.haptic)).toEqual(["lose"]);
    const win = planCues([delivered(1, 0), { type: "groupCompleted", group: 1 }, { type: "won" }]);
    expect(win.filter((c) => c.haptic).map((c) => c.haptic)).toEqual(["win"]);
    // Both sounds still play; only the weaker vibration is dropped.
    expect(lose.map((c) => c.sound)).toContain("collect");
    // Alone, a delivery does vibrate.
    expect(planCues([delivered(1, 3)])[0]!.haptic).toBe("collect");
  });

  it("winning replaces the completion chime of the same tick; completing alone chimes", () => {
    const done: Ev = { type: "groupCompleted", group: 0 };
    expect(planCues([delivered(0, 0), done]).map((c) => c.sound)).toEqual(["collect", "portal"]);
    expect(planCues([delivered(0, 0), done, { type: "won" }]).map((c) => c.sound)).toEqual([
      "collect",
      "win",
    ]);
  });

  it("a refused tap is audible only when the player did something the game cannot do", () => {
    expect(rejectionCue("fieldFull")).toEqual({ sound: "invalid", haptic: "invalid" });
    expect(rejectionCue("noReachableCube")).toEqual({ sound: "invalid", haptic: "invalid" });
    expect(rejectionCue("unavailable")).toBeNull();
    expect(rejectionCue("gameOver")).toBeNull();
  });

  it("playing cues goes through the sinks in order, and a failing sink never stops the rest", () => {
    const played: string[] = [];
    const cues: Cue[] = [
      { sound: "tap", haptic: "tap" },
      { sound: "park", haptic: "park" },
      { sound: "win" },
    ];
    playCues(cues, {
      sound: (n) => {
        played.push(`s:${n}`);
        if (n === "tap") throw new Error("audio device lost");
      },
      haptic: (k) => played.push(`h:${k}`),
    });
    expect(played).toEqual(["s:tap", "s:park", "h:park", "s:win"]);
  });

  it("a real game's events give the intended sound sequence (summon, pick up, deliver rising, win)", () => {
    const level: collect.CollectLevel = {
      id: "t",
      name: "t",
      width: 3,
      height: 1,
      palette: ["#e24a4a"],
      cells: [0, 0, 0],
      columns: [[{ color: 0, capacity: 3 }]],
      slots: 1,
      squad: 1,
      spawnGap: 1,
      fieldCap: 1,
    };
    const session = new collect.CollectSession(level);
    const sounds: string[] = [];
    const left: number[] = [];
    session.subscribe((batch) => {
      for (const c of planCues(batch.events)) {
        sounds.push(c.sound);
        if (c.sound === "collect") left.push(c.options!.chargeLeft as number);
      }
    });
    expect(session.tap({ kind: "select", column: 0 }).ok).toBe(true);
    for (let i = 0; i < 500 && session.state.status === "playing"; i++) {
      if (session.tick() === null) break;
    }
    expect(session.state.status).toBe("won");
    expect(sounds[0]).toBe("tap");
    expect(sounds.at(-1)).toBe("win");
    expect(sounds.filter((s) => s === "pickup").length).toBeGreaterThanOrEqual(1);
    // Three deliveries, each at least as high as the one before, ending on the top note.
    expect(left).toEqual([2, 1, 0]);
  });
});

/** An audio context that only counts the sounds it is asked to make. */
function countingAudio(settings: { sound: boolean }) {
  let oscillators = 0;
  const param = { setValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {} };
  const node = () => ({ connect() {}, disconnect() {}, gain: param, frequency: param, type: "" });
  const ctx = {
    currentTime: 0,
    destination: {},
    state: "running",
    resume: async () => undefined,
    suspend: async () => undefined,
    createGain: node,
    createBiquadFilter: node,
    createOscillator: () => {
      oscillators++;
      return { ...node(), start() {}, stop() {}, onended: null };
    },
  } as unknown as AudioLike;
  const engine = new AudioEngine(
    { sound: settings.sound, music: false, sfxVolume: 1, musicVolume: 1 },
    () => ctx,
  );
  engine.unlock();
  return { engine, count: () => oscillators };
}

describe("the sound setting is respected", () => {
  const sinksFor = (engine: AudioEngine) => ({
    sound: (n: Parameters<AudioEngine["play"]>[0], o?: Parameters<AudioEngine["play"]>[1]) =>
      engine.play(n, o),
    haptic: () => undefined,
  });
  const batch = planCues([picked, delivered(0, 0), { type: "groupCompleted", group: 0 }]);

  it("with sound on, a batch makes noise", () => {
    const a = countingAudio({ sound: true });
    playCues(batch, sinksFor(a.engine));
    expect(a.count()).toBeGreaterThan(0);
  });

  it("with sound off, nothing is scheduled", () => {
    const a = countingAudio({ sound: false });
    playCues(batch, sinksFor(a.engine));
    expect(a.count()).toBe(0);
  });
});

describe("particles", () => {
  const p = (born: number, life = 100) => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    born,
    life,
    color: 0xffffff,
    s0: 10,
    s1: 0,
    alpha: 1,
  });

  it("expire after their life and report their age", () => {
    const ps = new Particles(8);
    ps.emit(p(0, 100));
    const ages: number[] = [];
    ps.forEachLive(25, (_, age) => ages.push(age));
    expect(ages).toEqual([0.25]);
    expect(ps.count(100)).toBe(0);
    expect(ps.count(-1)).toBe(0);
  });

  it("a full buffer recycles the oldest and never grows", () => {
    const ps = new Particles(3);
    for (let i = 0; i < 10; i++) ps.emit(p(i * 10, 1000));
    expect(ps.count(100)).toBe(3);
    const born: number[] = [];
    ps.forEachLive(100, (q) => born.push(q.born));
    expect(born.sort((a, b) => a - b)).toEqual([70, 80, 90]);
    ps.clear();
    expect(ps.count(100)).toBe(0);
  });
});

describe("effects", () => {
  const make = (reduced: boolean, tickMs = 1000 / 24) => {
    const ps = new Particles(200);
    const e = new Emitter(ps, 30, reduced);
    e.tickMs = tickMs;
    return { ps, e };
  };

  it("a carrier leaves a puff at most every 1.5 ticks; the throttle follows the speed", () => {
    const puffTimes = (tickMs: number) => {
      const { e } = make(false, tickMs);
      const times: number[] = [];
      let last = -Infinity;
      for (let t = 0; t <= 400; t += 4) {
        const next = e.trail(0, 0, 1, t, last);
        if (next !== last) times.push(next);
        last = next;
      }
      return times;
    };
    const slow = puffTimes(40);
    const fast = puffTimes(20); // 2×: ticks are half as long, so puffs come twice as often
    for (const [times, tickMs] of [
      [slow, 40],
      [fast, 20],
    ] as const) {
      for (let i = 1; i < times.length; i++) {
        expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(tickMs * 1.5);
      }
    }
    expect(fast.length).toBeGreaterThanOrEqual(slow.length * 1.7);
    expect(fast.length).toBeLessThanOrEqual(slow.length * 2.2);
  });

  it("effects last the same number of ticks at 2× (half the milliseconds)", () => {
    const one = make(false, 40);
    const two = make(false, 20);
    one.e.sparks(0, 0, 1, 4, 0);
    two.e.sparks(0, 0, 1, 4, 0);
    const life = (ps: Particles) => {
      let l = 0;
      ps.forEachLive(0, (p) => (l = p.life));
      return l;
    };
    expect(life(one.ps)).toBe(2 * life(two.ps));
  });

  it("sparks fan out and a win throws one fan per colour, each half a tick after the last", () => {
    const { ps, e } = make(false, 40);
    e.sparks(10, 10, 1, 6, 0);
    expect(ps.count(1)).toBe(6);
    ps.clear();
    e.fountain(0, 0, [1, 2, 3], 100);
    expect(ps.count(150)).toBe(18);
    const births: number[] = [];
    ps.forEachLive(150, (p) => births.push(p.born));
    expect([...new Set(births)].sort((a, b) => a - b)).toEqual([100, 120, 140]);
  });

  it("reduced motion: no trails, sparks or fountain; a completion is a stationary fade", () => {
    const { ps, e } = make(true);
    expect(e.trail(0, 0, 1, 1000, -Infinity)).toBe(-Infinity);
    e.sparks(0, 0, 1, 6, 0);
    e.fountain(0, 0, [1, 2], 0);
    expect(ps.count(10)).toBe(0);
    e.bloom(5, 5, 1, 0);
    expect(ps.count(10)).toBe(1);
    ps.forEachLive(10, (p) => {
      expect(p.s1).toBe(p.s0);
      expect([p.vx, p.vy]).toEqual([0, 0]);
    });
  });

  it("with motion allowed the completion bloom grows", () => {
    const { ps, e } = make(false);
    e.bloom(5, 5, 1, 0);
    ps.forEachLive(10, (p) => expect(p.s1).toBeGreaterThan(p.s0));
  });
});

describe("the pickup squash", () => {
  it("the squash flattens and widens at its peak, and rests at the plain scale", () => {
    expect(squashX(4, 0)).toBe(4);
    expect(squashY(4, 0)).toBe(4);
    expect(squashX(4, 1)).toBeGreaterThan(4);
    expect(squashY(4, 1)).toBeLessThan(4);
  });

  it("a finished group's badge swells, a dropped one shrinks, and reduced motion never scales", () => {
    expect(leaveScale(true, false)).toBeGreaterThan(1);
    expect(leaveScale(false, false)).toBeLessThan(1);
    expect(leaveScale(true, true)).toBe(1);
    expect(leaveScale(false, true)).toBe(1);
  });

  it("the squash swells from nothing to a peak and back, and is zero outside its moment", () => {
    expect(bump(-0.1)).toBe(0);
    expect(bump(0)).toBe(0);
    expect(bump(0.5)).toBeCloseTo(1, 6);
    expect(bump(1)).toBe(0);
    expect(bump(1.5)).toBe(0);
    expect(bump(0.25)).toBeCloseTo(bump(0.75), 6);
  });
});
