import { afterEach, describe, expect, it, vi } from "vitest";
import { createState, type LaunchSource } from "@hexhue/core";
import { Hinter } from "./hinter";
import { worlds } from "./levels";

/** A stand-in Worker: records requests; the test replies through `reply`. */
class StubWorker {
  static last: StubWorker | null = null;
  posted: { id: number }[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  constructor() {
    StubWorker.last = this;
  }
  postMessage(message: { id: number }) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(id: number, move: LaunchSource | null) {
    this.onmessage?.({ data: { id, move } });
  }
}

const state = createState(worlds[0]!.levels[0]!.level);
const move: LaunchSource = { kind: "column", index: 1 };

describe("Hinter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    StubWorker.last = null;
  });

  it("answers the latest request with the worker's move", () => {
    vi.stubGlobal("Worker", StubWorker);
    const done = vi.fn();
    new Hinter().request(state, done);
    const worker = StubWorker.last!;
    worker.reply(worker.posted[0]!.id, move);
    expect(done).toHaveBeenCalledWith(move);
  });

  it("drops replies to a superseded or cancelled request", () => {
    vi.stubGlobal("Worker", StubWorker);
    const hinter = new Hinter();
    const first = vi.fn();
    const second = vi.fn();
    hinter.request(state, first);
    hinter.request(state, second);
    const worker = StubWorker.last!;
    worker.reply(worker.posted[0]!.id, move);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    hinter.cancel();
    worker.reply(worker.posted[1]!.id, move);
    expect(second).not.toHaveBeenCalled();
  });

  it("answers nothing when no move was found, and only once per request", () => {
    vi.stubGlobal("Worker", StubWorker);
    const done = vi.fn();
    new Hinter().request(state, done);
    const worker = StubWorker.last!;
    const id = worker.posted[0]!.id;
    worker.reply(id, null);
    worker.reply(id, move);
    expect(done).not.toHaveBeenCalled();
  });

  it("falls back to no hints when workers are unavailable or broken", () => {
    vi.stubGlobal("Worker", undefined);
    const done = vi.fn();
    expect(() => new Hinter().request(state, done)).not.toThrow();

    vi.stubGlobal("Worker", StubWorker);
    const hinter = new Hinter();
    hinter.request(state, done);
    const broken = StubWorker.last!;
    broken.onerror?.();
    expect(broken.terminated).toBe(true);
    hinter.request(state, done);
    expect(StubWorker.last).toBe(broken); // no new worker, no new message
    expect(broken.posted).toHaveLength(1);
    expect(done).not.toHaveBeenCalled();
  });
});
