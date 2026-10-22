import { describe, expect, it, vi } from "vitest";
import { watchUpdates } from "./updates";

class Worker extends EventTarget {
  state = "installing";
  postMessage = vi.fn();
  install() {
    this.state = "installed";
    this.dispatchEvent(new Event("statechange"));
  }
}

function setup({ controlled = true, waiting = null as Worker | null } = {}) {
  const registration = Object.assign(new EventTarget(), {
    waiting,
    installing: null as Worker | null,
  });
  const container = Object.assign(new EventTarget(), { controller: controlled ? {} : null });
  let onRefresh: (() => void) | null = null;
  const timers: (() => void)[] = [];
  const deps = {
    registration,
    container,
    showToast: vi.fn((fn: () => void) => (onRefresh = fn)),
    reload: vi.fn(),
    setTimer: (fn: () => void) => void timers.push(fn),
  };
  watchUpdates(deps);
  /** A new version finished installing and is waiting. */
  const deploy = () => {
    const w = new Worker();
    registration.installing = w;
    registration.dispatchEvent(new Event("updatefound"));
    w.install();
    registration.waiting = w;
    registration.installing = null;
    return w;
  };
  return {
    deps,
    deploy,
    registration,
    click: () => onRefresh!(),
    activate: () => container.dispatchEvent(new Event("controllerchange")),
    timers,
  };
}

describe("update flow", () => {
  it("offers nothing on the very first install", () => {
    const t = setup({ controlled: false });
    t.deploy();
    t.activate(); // clients.claim() on first install
    expect(t.deps.showToast).not.toHaveBeenCalled();
    expect(t.deps.reload).not.toHaveBeenCalled();
  });

  it("offers a refresh for an update; Refresh activates it and reloads once it takes over", () => {
    const t = setup();
    const w = t.deploy();
    expect(t.deps.showToast).toHaveBeenCalledOnce();
    t.click();
    expect(w.postMessage).toHaveBeenCalledWith("skipWaiting");
    expect(t.deps.reload).not.toHaveBeenCalled();
    t.activate();
    expect(t.deps.reload).toHaveBeenCalledOnce();
  });

  it("offers an update that was already waiting when the page loaded", () => {
    const t = setup({ waiting: new Worker() });
    expect(t.deps.showToast).toHaveBeenCalledOnce();
  });

  it("never reloads by itself when another tab activated the update; Refresh then reloads", () => {
    const t = setup();
    t.deploy();
    t.registration.waiting = null; // another tab pressed Refresh first
    t.activate();
    expect(t.deps.reload).not.toHaveBeenCalled();
    t.click();
    expect(t.deps.reload).toHaveBeenCalledOnce();
  });

  it("after a second deploy, Refresh activates the newest waiting version", () => {
    const t = setup();
    const first = t.deploy();
    const second = t.deploy();
    t.click();
    expect(first.postMessage).not.toHaveBeenCalled();
    expect(second.postMessage).toHaveBeenCalledWith("skipWaiting");
  });

  it("reloads anyway if the new version never takes over", () => {
    const t = setup();
    t.deploy();
    t.click();
    expect(t.timers).toHaveLength(1);
    t.timers[0]!();
    expect(t.deps.reload).toHaveBeenCalledOnce();
  });
});
