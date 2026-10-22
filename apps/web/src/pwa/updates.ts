/**
 * New-version flow for a registered service worker: when an update has installed, offer a
 * refresh (never forced: a player may be mid-level). Refresh activates whichever version is
 * waiting *now* (another deploy may have replaced the one first offered), or simply reloads if
 * another tab already activated it.
 */
export interface UpdateDeps {
  registration: {
    readonly waiting: { postMessage(message: unknown): void } | null;
    readonly installing: (EventTarget & { readonly state: string }) | null;
    addEventListener(type: "updatefound", listener: () => void): void;
  };
  container: {
    readonly controller: unknown;
    addEventListener(type: "controllerchange", listener: () => void): void;
  };
  /** Shows the (single) update banner; its button calls `onRefresh`. */
  showToast(onRefresh: () => void): void;
  reload(): void;
  /** If the new version hasn't taken over by then, reload anyway. */
  fallbackMs?: number;
  setTimer?: (fn: () => void, ms: number) => void;
}

export function watchUpdates(deps: UpdateDeps): void {
  const { registration, container } = deps;
  const setTimer = deps.setTimer ?? ((fn, ms) => void setTimeout(fn, ms));
  let refreshing = false;
  container.addEventListener("controllerchange", () => {
    // Only reload when the player asked for the new version (not on the very first install, and
    // not when another tab activated it: this tab's banner still offers the reload).
    if (refreshing) deps.reload();
  });
  const refresh = () => {
    const waiting = registration.waiting;
    if (!waiting) return deps.reload();
    refreshing = true;
    waiting.postMessage("skipWaiting");
    setTimer(() => deps.reload(), deps.fallbackMs ?? 4000);
  };
  // An update is only "new" if a previous version controls this page.
  if (registration.waiting && container.controller) deps.showToast(refresh);
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && container.controller) deps.showToast(refresh);
    });
  });
}
