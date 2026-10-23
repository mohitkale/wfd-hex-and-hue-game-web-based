import {
  CHORDS,
  CHORD_SECONDS,
  soundSpec,
  type Note,
  type SoundName,
  type SoundOptions,
} from "./sounds";

/** The slice of the Web Audio API the engine uses (lets tests pass a fake). */
export interface AudioLike {
  readonly currentTime: number;
  readonly destination: AudioNode;
  readonly state: string;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  createBiquadFilter(): BiquadFilterNode;
}

export interface AudioSettings {
  sound: boolean;
  music: boolean;
  sfxVolume: number;
  musicVolume: number;
}

/**
 * Minimum spacing for rapid repeats (a wisp sweeping a lane would otherwise stack dozens). `collect`
 * is shorter than a v2 tick at 2× (about 21 ms) so a rising run keeps its notes; `pickup` pops are
 * deliberately thinned to about one every other tick at 1×.
 */
const THROTTLE: Partial<Record<SoundName, number>> = {
  collect: 0.015,
  pickup: 0.06,
  invalid: 0.15,
};

/** Seconds of slow attack / release on music pad notes. */
const PAD_ATTACK = 1.2;
const PAD_RELEASE = 1.2;

const quiet = (p: Promise<void>) => void p.catch(() => {});

/**
 * Plays the procedural sound effects and the ambient music. Nothing happens until `unlock()` is
 * called from a user gesture (browsers keep audio suspended until then); every call before that is
 * a silent no-op, so the game never waits on audio.
 */
export class AudioEngine {
  private ctx: AudioLike | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private lastPlayed = new Map<SoundName, number>();
  /** The running music session: its own fade gain, so stopping it can't leave chords behind. */
  private music: {
    timer: ReturnType<typeof setInterval>;
    out: GainNode;
    filter: BiquadFilterNode;
  } | null = null;
  private nextChordAt = 0;
  private chord = 0;
  private applied = "";

  constructor(
    private settings: AudioSettings,
    private readonly create: () => AudioLike | null = () =>
      typeof AudioContext !== "undefined" ? (new AudioContext() as unknown as AudioLike) : null,
  ) {}

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  get musicPlaying(): boolean {
    return this.music !== null;
  }

  /** Call from a user gesture (tap / key). Safe to call repeatedly; also recovers "interrupted". */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = this.create();
      if (!this.ctx) return;
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.ctx.destination);
      this.applyVolumes(true);
    }
    if (this.ctx.state !== "running") quiet(this.ctx.resume());
    this.syncMusic();
  }

  /** Apply new settings (mute toggles, volumes); a no-op when nothing audible changed. */
  configure(settings: AudioSettings): void {
    this.settings = settings;
    this.applyVolumes();
    this.syncMusic();
  }

  play(name: SoundName, opts: SoundOptions = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.settings.sound || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const gap = THROTTLE[name];
    // The last note of a collect run (the highest) always plays.
    const exempt = name === "collect" && opts.chargeLeft === 0;
    if (gap !== undefined && !exempt && now - (this.lastPlayed.get(name) ?? -Infinity) < gap)
      return;
    this.lastPlayed.set(name, now);
    for (const note of soundSpec(name, opts)) this.note(note, now, this.sfx);
  }

  /**
   * Tab hidden / shown. Suspending freezes the audio clock, so the music scheduler simply has
   * nothing to do until it resumes: no duplicate chords on return.
   */
  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) quiet(this.ctx.suspend());
    else quiet(this.ctx.resume());
  }

  /** Stops music and releases the audio context (game teardown). */
  dispose(): void {
    this.stopMusic(true);
    const ctx = this.ctx as (AudioLike & { close?: () => Promise<void> }) | null;
    if (ctx?.close) quiet(ctx.close());
    this.ctx = null;
  }

  private note(n: Note, now: number, out: AudioNode, release = 0.04): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const t0 = now + n.at;
    const t1 = t0 + n.dur;
    osc.type = n.wave;
    osc.frequency.setValueAtTime(n.freq, t0);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t1);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(n.gain, t0 + Math.min(0.01, n.dur / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, t1 + release);
    this.wire(osc, env, out, t0, t1 + release + 0.02);
  }

  /** A pad note: slow swell in, hold, slow fade out — sounds like air, not plucks. */
  private pad(freq: number, t0: number, dur: number, peak: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const t1 = t0 + dur;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t0);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + PAD_ATTACK);
    env.gain.setValueAtTime(peak, t1 - PAD_RELEASE);
    env.gain.linearRampToValueAtTime(0, t1);
    this.wire(osc, env, out, t0, t1 + 0.05);
  }

  private wire(
    osc: OscillatorNode,
    env: GainNode,
    out: AudioNode,
    start: number,
    stop: number,
  ): void {
    osc.connect(env);
    env.connect(out);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
    osc.start(start);
    osc.stop(stop);
  }

  private applyVolumes(force = false): void {
    if (!this.ctx || !this.sfx || !this.musicBus) return;
    const sfx = this.settings.sound ? this.settings.sfxVolume : 0;
    const music = this.settings.music ? this.settings.musicVolume * 0.35 : 0;
    const key = `${sfx}/${music}`;
    if (!force && key === this.applied) return;
    this.applied = key;
    const t = this.ctx.currentTime;
    // Smoothed, so muting never clicks.
    this.sfx.gain.setTargetAtTime(sfx, t, 0.02);
    this.musicBus.gain.setTargetAtTime(music, t, 0.05);
  }

  private syncMusic(): void {
    const wanted = this.settings.music && this.ctx !== null;
    if (wanted && !this.music) this.startMusic();
    else if (!wanted && this.music) this.stopMusic();
  }

  /** Schedules pad chords a little ahead, so timer jitter never causes gaps. */
  private startMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const out = ctx.createGain();
    out.gain.setValueAtTime(1, ctx.currentTime);
    out.connect(this.musicBus);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(out);
    this.nextChordAt = ctx.currentTime + 0.1;
    const schedule = () => {
      // After a long stall, skip missed chords rather than starting them all at once.
      this.nextChordAt = Math.max(this.nextChordAt, ctx.currentTime + 0.05);
      while (this.nextChordAt < ctx.currentTime + 1.5) {
        const chord = CHORDS[this.chord % CHORDS.length]!;
        for (const freq of chord) this.pad(freq, this.nextChordAt, CHORD_SECONDS + 1, 0.18, filter);
        this.chord++;
        this.nextChordAt += CHORD_SECONDS;
      }
    };
    schedule();
    this.music = { timer: setInterval(schedule, 500), out, filter };
  }

  /** Fades this session out and disconnects it, cutting off anything already scheduled. */
  private stopMusic(immediate = false): void {
    const m = this.music;
    if (!m) return;
    clearInterval(m.timer);
    this.music = null;
    const ctx = this.ctx;
    if (!ctx || immediate) {
      m.out.disconnect();
      return;
    }
    m.out.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    setTimeout(() => {
      m.out.disconnect();
      m.filter.disconnect();
    }, 1000);
  }
}
