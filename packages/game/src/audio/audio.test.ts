import { describe, expect, it } from "vitest";
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
  let time = 0;
  let state = "suspended";
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({ connect() {}, gain: param(), frequency: param(), type: "" });
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
    createGain: () => node() as unknown as GainNode,
    createBiquadFilter: () => node() as unknown as BiquadFilterNode,
    createOscillator: () =>
      ({
        ...node(),
        start: (t: number) => started.push(t),
        stop() {},
      }) as unknown as OscillatorNode,
  };
  return { ctx: ctx as unknown as AudioLike, started, advance: (s: number) => (time += s) };
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

  it("respects the sound toggle and throttles rapid collects", async () => {
    const f = fakeContext();
    const engine = new AudioEngine(on, () => f.ctx);
    engine.unlock();
    await Promise.resolve();
    engine.play("collect");
    engine.play("collect"); // same instant: throttled
    f.advance(0.1);
    engine.play("collect");
    expect(f.started).toHaveLength(2);
    engine.configure({ ...on, sound: false });
    engine.play("win");
    expect(f.started).toHaveLength(2);
  });

  it("never throws without Web Audio", () => {
    const engine = new AudioEngine(on, () => null);
    expect(() => {
      engine.unlock();
      engine.play("win");
      engine.setHidden(true);
    }).not.toThrow();
  });
});
