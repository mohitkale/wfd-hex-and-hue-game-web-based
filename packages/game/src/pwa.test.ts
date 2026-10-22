import { afterEach, describe, expect, it, vi } from "vitest";
import { canInstall, onInstallChange, promptInstall } from "./pwa";

function stubWindow(prompt?: { outcome: "accepted" | "dismissed"; fail?: boolean }) {
  const target = new EventTarget();
  const win = Object.assign(target, {
    __hexhueInstall: prompt
      ? {
          prompt: vi.fn(async () => {
            if (prompt.fail) throw new Error("already used");
          }),
          userChoice: Promise.resolve({ outcome: prompt.outcome }),
        }
      : undefined,
  });
  vi.stubGlobal("window", win);
  return win;
}

describe("install prompt", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is unavailable until the page captured the browser's prompt", () => {
    stubWindow();
    expect(canInstall()).toBe(false);
    stubWindow({ outcome: "accepted" });
    expect(canInstall()).toBe(true);
  });

  it("shows the prompt once and reports the player's choice", async () => {
    const win = stubWindow({ outcome: "accepted" });
    expect(await promptInstall()).toBe(true);
    expect(win.__hexhueInstall).toBeUndefined();
    expect(canInstall()).toBe(false);
    expect(await promptInstall()).toBe(false);
  });

  it("treats a dismissed or failing prompt as not installed", async () => {
    stubWindow({ outcome: "dismissed" });
    expect(await promptInstall()).toBe(false);
    stubWindow({ outcome: "accepted", fail: true });
    expect(await promptInstall()).toBe(false);
  });

  it("notifies listeners when installing becomes (un)available", () => {
    const win = stubWindow();
    const listener = vi.fn();
    const off = onInstallChange(listener);
    win.dispatchEvent(new Event("hexhue:installable"));
    off();
    win.dispatchEvent(new Event("hexhue:installable"));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
