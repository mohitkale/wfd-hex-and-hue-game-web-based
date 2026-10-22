import type { LaunchSource, SimState } from "@hexhue/core";

type Reply = { id: number; move: LaunchSource | null };

/**
 * Asks a worker for idle hints. Only the latest request is answered: any newer request or a
 * `cancel()` makes earlier replies stale. Without worker support there are simply no hints.
 */
export class Hinter {
  private worker: Worker | null | undefined;
  private seq = 0;
  private pending: ((move: LaunchSource) => void) | null = null;

  /** Starts a search from `state` (copied by the worker message); `done` gets a found move. */
  request(state: SimState, done: (move: LaunchSource) => void): void {
    const worker = this.ensureWorker();
    if (!worker) return;
    this.pending = done;
    worker.postMessage({ id: ++this.seq, state });
  }

  /** Drops any search in flight (the board changed). */
  cancel(): void {
    this.seq++;
    this.pending = null;
  }

  private ensureWorker(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    try {
      this.worker = new Worker(new URL("./hint.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<Reply>) => {
        if (e.data.id !== this.seq || !this.pending) return;
        const done = this.pending;
        this.pending = null;
        if (e.data.move) done(e.data.move);
      };
      // A broken worker just means no hints; play is never affected.
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
    return this.worker;
  }
}

let shared: Hinter | null = null;

/** One worker for the whole game, created on the first hint request. */
export function getHinter(): Hinter {
  shared ??= new Hinter();
  return shared;
}
