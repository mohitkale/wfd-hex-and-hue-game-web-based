/** Vibration patterns (ms). Kept short: haptics should feel like texture, not alarms. */
export const PATTERNS = {
  tap: [8],
  invalid: [12, 40, 12],
  collect: [4],
  park: [10],
  portal: [14],
  win: [20, 50, 20, 50, 60],
  lose: [70],
} as const;

export type HapticKind = keyof typeof PATTERNS;

/** Minimum gap between collect pulses; a run of deliveries would otherwise buzz constantly. */
export const COLLECT_THROTTLE_MS = 70;

/**
 * Thin wrapper over `navigator.vibrate` with an on/off switch (settings, M6.5) and throttling.
 * Browsers without vibration (iOS Safari, desktop) are a silent no-op.
 */
export class Haptics {
  enabled = true;
  private lastCollect = -Infinity;

  constructor(
    private readonly vibrate: ((pattern: number[]) => unknown) | null = typeof navigator !==
      "undefined" && typeof navigator.vibrate === "function"
      ? (p) => {
          // Before the first user gesture Chrome rejects (and logs) every call: skip them.
          if (navigator.userActivation?.hasBeenActive === false) return;
          navigator.vibrate(p);
        }
      : null,
    private readonly now: () => number = () => performance.now(),
  ) {}

  play(kind: HapticKind): void {
    if (!this.enabled || !this.vibrate) return;
    if (kind === "collect") {
      const t = this.now();
      if (t - this.lastCollect < COLLECT_THROTTLE_MS) return;
      this.lastCollect = t;
    }
    this.vibrate([...PATTERNS[kind]]);
  }
}
