import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine, type AudioLike } from "./engine";
import { PENTATONIC, soundSpec, type SoundName } from "./sounds";

const ALL: SoundName[] = [
  "tap",
  "invalid",
  "collect",
  "portal",
  "park",
  "launch",
  "win",
  "lose",
  "coin",
  "booster",
  "ui",
];

describe("soundSpec", () => {
  it("every sound is short, audible and gentle", () => {
    for (const name of ALL) {
      const notes = soundSpec(name);
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.freq).toBeGreaterThan(80);
        expect(n.freq).toBeLessThan(5000);
        expect(n.dur).toBeGreaterThan(0);
        expect(n.at + n.dur).toBeLessThanOrEqual(1.5);
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(0.3);
      }
    }
  });

  it("collect climbs the pentatonic scale as a wisp empties", () => {
    const pitch = (c: number) => soundSpec("collect", { chargeLeft: c })[0]!.freq;
    expect(pitch(9)).toBe(PENTATONIC[0]);
    expect(pitch(0)).toBe(PENTATONIC.at(-1));
    expect(pitch(3)).toBeGreaterThan(pitch(4));
    expect(pitch(40)).toBe(PENTATONIC[0]);
  });
});

/** Records what the engine schedules. */
function fakeContext() {
  const started: number[] = [];
  const disconnected: unknown[] = [];
  let time = 0;
  let state = "suspended";
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    setTargetAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = (): Record<string, unknown> => {
    const n: Record<string, unknown> = {
      connect() {},
      gain: param(),
      frequency: param(),
      type: "",
    };
    n.disconnect = () => disconnected.push(n);
    return n;
  };
  const ctx = {
    get currentTime() {
      return time;
    },
    destination: {} as AudioNode,
    get state() {
      return state;
    },
    async resume() {
      state = "running";
    },
    async suspend() {
      state = "suspended";
    },
    async close() {
      state = "closed";
    },
    createGain: () => node() as unknown as GainNode,
    createBiquadFilter: () => node() as unknown as BiquadFilterNode,
    createOscillator: () =>
      ({
        ...node(),
        start: (t: number) => started.push(t),
        stop() {},
      }) as unknown as OscillatorNode,
  };
  return {
    ctx: ctx as unknown as AudioLike,
    started,
    disconnected,
    advance: (s: number) => (time += s),
  };
}

const on = { sound: true, music: false, sfxVolume: 1, musicVolume: 1 };

describe("AudioEngine", () => {
  it("is silent until unlocked by a gesture", async () => {
    const f = fakeContext();
    const engine = new AudioEngine(on, () => f.ctx);
    engine.play("tap");
    expect(f.started).toEqual([]);
    engine.unlock();
    await Promise.resolve();
    engine.play("tap");
    expect(f.started).toHaveLength(1);
  });

  it("respects the sound toggle and throttles rapid collects, but never drops the top note", async () => {
    const f = fakeContext();
    const engine = new AudioEngine(on, () => f.ctx);
    engine.unlock();
    await Promise.resolve();
    engine.play("collect", { chargeLeft: 3 });
    engine.play("collect", { chargeLeft: 2 }); // same instant: throttled
    engine.play("collect", { chargeLeft: 0 }); // last of the run: always plays
    f.advance(0.03);
    engine.play("collect", { chargeLeft: 5 });
    expect(f.started).toHaveLength(3);
    engine.configure({ ...on, sound: false });
    engine.play("win");
    expect(f.started).toHaveLength(3);
  });

  it("never throws without Web Audio", () => {
    const engine = new AudioEngine(on, () => null);
    expect(() => {
      engine.unlock();
      engine.play("win");
      engine.setHidden(true);
      engine.dispose();
    }).not.toThrow();
  });
});

describe("AudioEngine music", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts with music on, schedules a chord ahead, and keeps one session", async () => {
    const f = fakeContext();
    const engine = new AudioEngine({ ...on, music: true }, () => f.ctx);
    engine.unlock();
    await Promise.resolve();
    expect(engine.musicPlaying).toBe(true);
    const first = f.started.length;
    expect(first).toBe(3); // one three-note chord
    engine.unlock(); // a later gesture must not start a second session
    vi.advanceTimersByTime(500);
    expect(f.started.length).toBe(first);
  });

  it("hide/show only suspends and resumes: no extra chords on return", async () => {
    const f = fakeContext();
    const engine = new AudioEngine({ ...on, music: true }, () => f.ctx);
    engine.unlock();
    await Promise.resolve();
    const before = f.started.length;
    engine.setHidden(true);
    await Promise.resolve();
    vi.advanceTimersByTime(5000); // clock frozen while suspended
    engine.setHidden(false);
    await Promise.resolve();
    vi.advanceTimersByTime(500);
    expect(f.started.length).toBe(before);
  });

  it("turning music off fades and disconnects the session; on again starts fresh", async () => {
    const f = fakeContext();
    const engine = new AudioEngine({ ...on, music: true }, () => f.ctx);
    engine.unlock();
    await Promise.resolve();
    engine.configure({ ...on, music: false });
    expect(engine.musicPlaying).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(f.disconnected.length).toBeGreaterThanOrEqual(2); // session gain + filter
    engine.configure({ ...on, music: true });
    expect(engine.musicPlaying).toBe(true);
  });

  it("skips missed chords after a long stall instead of stacking them", async () => {
    const f = fakeContext();
    const engine = new AudioEngine({ ...on, music: true }, () => f.ctx);
    engine.unlock();
    await Promise.resolve();
    const before = f.started.length;
    f.advance(20); // main thread stalled 20 s while audio kept running
    vi.advanceTimersByTime(500);
    // At most one new chord (3 notes), not five.
    expect(f.started.length - before).toBeLessThanOrEqual(3);
  });
});
