/** The q-th percentile (0..1) of an ascending-sorted array, or null if it is empty. */
export function percentile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return +sorted[i]!.toFixed(3);
}

/** A fixed-size ring of recent samples (the oldest are overwritten) with percentile summaries. */
export class RingStats {
  private readonly data: Float32Array;
  private count = 0;

  constructor(readonly capacity = 2400) {
    this.data = new Float32Array(capacity);
  }

  push(v: number): void {
    this.data[this.count % this.capacity] = v;
    this.count++;
  }

  /** Samples currently held. */
  get size(): number {
    return Math.min(this.count, this.capacity);
  }

  /** Total samples ever pushed. */
  get total(): number {
    return this.count;
  }

  /** `{ median, p95, max }` of the held samples (all null when empty). */
  summary(): { median: number | null; p95: number | null; max: number | null } {
    const sorted = Array.from(this.data.subarray(0, this.size)).sort((a, b) => a - b);
    return {
      median: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      max: percentile(sorted, 1),
    };
  }

  clear(): void {
    this.count = 0;
  }
}
