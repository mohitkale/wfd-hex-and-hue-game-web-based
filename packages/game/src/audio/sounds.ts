/**
 * Every sound effect as data: a few short notes, each an oscillator with a quick envelope. Original
 * and generated at runtime (no audio files to load, so the game stays small and works offline).
 */

export type Wave = "sine" | "triangle" | "square" | "sawtooth";

export interface Note {
  /** Hz at the start. */
  freq: number;
  /** Optional Hz to glide to by the end. */
  to?: number;
  wave: Wave;
  /** Seconds after the sound starts. */
  at: number;
  /** Seconds. */
  dur: number;
  /** Peak gain (0..1) before master volume. */
  gain: number;
}

export type SoundName =
  | "tap"
  | "invalid"
  | "collect"
  | "pickup"
  | "portal"
  | "park"
  | "launch"
  | "win"
  | "lose"
  | "coin"
  | "booster"
  | "ui";

/** A minor pentatonic over two octaves from A4: always consonant, whatever plays together. */
export const PENTATONIC = [
  440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98,
];

export interface SoundOptions {
  /** For "collect": cubes left in the delivering box; a lower count plays a higher note. */
  chargeLeft?: number;
}

export function soundSpec(name: SoundName, opts: SoundOptions = {}): Note[] {
  switch (name) {
    case "tap":
      return [{ freq: 660, to: 880, wave: "triangle", at: 0, dur: 0.06, gain: 0.25 }];
    case "ui":
      return [{ freq: 520, wave: "sine", at: 0, dur: 0.05, gain: 0.18 }];
    case "invalid":
      return [
        { freq: 220, wave: "square", at: 0, dur: 0.07, gain: 0.08 },
        { freq: 196, wave: "square", at: 0.09, dur: 0.09, gain: 0.08 },
      ];
    case "launch":
      return [{ freq: 330, to: 660, wave: "triangle", at: 0, dur: 0.12, gain: 0.16 }];
    case "collect": {
      // Climbs the scale as a box empties, so a run of deliveries plays a little rising run.
      const step = Math.max(
        0,
        PENTATONIC.length - 1 - Math.min(opts.chargeLeft ?? 0, PENTATONIC.length - 1),
      );
      return [{ freq: PENTATONIC[step]!, wave: "sine", at: 0, dur: 0.09, gain: 0.14 }];
    }
    case "pickup":
      // A soft low "pop" as a familiar grabs a cube: quieter than the delivery notes it leads into.
      return [{ freq: 330, to: 440, wave: "triangle", at: 0, dur: 0.05, gain: 0.1 }];
    case "portal":
      return [
        { freq: 880, wave: "sine", at: 0, dur: 0.18, gain: 0.16 },
        { freq: 1318.51, wave: "sine", at: 0.06, dur: 0.22, gain: 0.12 },
      ];
    case "park":
      return [{ freq: 392, to: 294, wave: "triangle", at: 0, dur: 0.14, gain: 0.16 }];
    case "coin":
      return [
        { freq: 988, wave: "square", at: 0, dur: 0.05, gain: 0.07 },
        { freq: 1319, wave: "square", at: 0.05, dur: 0.12, gain: 0.07 },
      ];
    case "booster":
      return [
        { freq: 523.25, to: 1046.5, wave: "triangle", at: 0, dur: 0.25, gain: 0.16 },
        { freq: 659.25, to: 1318.51, wave: "sine", at: 0.04, dur: 0.25, gain: 0.1 },
      ];
    case "win":
      // A rising arpeggio and a sustained top note: the reveal's fanfare.
      return [440, 523.25, 659.25, 880, 1046.5].map((freq, i) => ({
        freq,
        wave: "triangle" as const,
        at: i * 0.11,
        dur: i === 4 ? 0.7 : 0.22,
        gain: 0.16,
      }));
    case "lose":
      return [
        { freq: 392, wave: "sine", at: 0, dur: 0.22, gain: 0.14 },
        { freq: 329.63, wave: "sine", at: 0.2, dur: 0.22, gain: 0.14 },
        { freq: 261.63, wave: "sine", at: 0.4, dur: 0.5, gain: 0.14 },
      ];
  }
}

/** Ambient pad progression (A minor feel): chords of three notes, one every `CHORD_SECONDS`. */
export const CHORDS: readonly (readonly number[])[] = [
  [220, 261.63, 329.63], // Am
  [174.61, 220, 261.63], // F
  [261.63, 329.63, 392], // C
  [196, 246.94, 293.66], // G
];
export const CHORD_SECONDS = 4;
