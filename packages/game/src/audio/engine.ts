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

/** Minimum spacing for rapid repeats (a wisp sweeping a lane would otherwise stack dozens). */
const THROTTLE: Partial<Record<SoundName, number>> = { collect: 0.045, invalid: 0.15 };

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
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextChordAt = 0;
  private chord = 0;

  constructor(
    private settings: AudioSettings,
    private readonly create: () => AudioLike | null = () =>
      typeof AudioContext !== "undefined" ? (new AudioContext() as unknown as AudioLike) : null,
  ) {}

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** Call from a user gesture (first tap / key). Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = this.create();
      if (!this.ctx) return;
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state !== "running") void this.ctx.resume();
    this.syncMusic();
  }

  /** Apply new settings (mute toggles, volumes) immediately. */
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
    if (gap !== undefined && now - (this.lastPlayed.get(name) ?? -Infinity) < gap) return;
    this.lastPlayed.set(name, now);
    for (const note of soundSpec(name, opts)) this.note(note, now, this.sfx);
  }

  /** Pause everything (tab hidden) and pick back up later. */
  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) {
      this.stopMusic();
      void this.ctx.suspend();
    } else {
      void this.ctx.resume();
      this.syncMusic();
    }
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
    osc.connect(env);
    env.connect(out);
    osc.start(t0);
    osc.stop(t1 + release + 0.02);
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.sfx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setValueAtTime(this.settings.sound ? this.settings.sfxVolume : 0, t);
    this.musicBus.gain.setValueAtTime(
      this.settings.music ? this.settings.musicVolume * 0.35 : 0,
      t,
    );
  }

  private syncMusic(): void {
    const wanted = this.settings.music && this.ctx !== null && this.ctx.state !== "closed";
    if (wanted && this.musicTimer === null) this.startMusic();
    else if (!wanted) this.stopMusic();
  }

  /** Schedules soft pad chords a little ahead of time, so timer jitter never causes gaps. */
  private startMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(this.musicBus);
    this.nextChordAt = ctx.currentTime + 0.1;
    const schedule = () => {
      while (this.nextChordAt < ctx.currentTime + 1.5) {
        const chord = CHORDS[this.chord % CHORDS.length]!;
        for (const freq of chord) {
          this.note(
            { freq, wave: "triangle", at: 0, dur: CHORD_SECONDS - 0.2, gain: 0.18 },
            this.nextChordAt,
            filter,
            1.2,
          );
        }
        this.chord++;
        this.nextChordAt += CHORD_SECONDS;
      }
    };
    schedule();
    this.musicTimer = setInterval(schedule, 500);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
