import { watchUpdates } from "./updates";

/**
 * Page side of the PWA: registers the service worker (production builds, on pages that opt in
 * with `<body data-offline>`: the game and the Grimoire) and offers a refresh when a new version is ready. Installing
 * is left to the browser's own prompt and menu.
 */

/** How often a long-open tab checks for a new deploy. */
const UPDATE_CHECK_MS = 30 * 60 * 1000;

export function setupPwa(): void {
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) {
    // A worker left over from `astro preview` (same localhost origin) would serve stale builds
    // to the dev server: remove it.
    void navigator.serviceWorker
      .getRegistrations()
      .then((all) => all.forEach((r) => void r.unregister()));
    return;
  }
  // Only the game and the Grimoire register the worker, so landing / blog visitors don't download
  // the game.
  if (!("offline" in document.body.dataset)) return;
  window.addEventListener("load", () => void register());
}

async function register(): Promise<void> {
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("/sw.js");
  } catch {
    return; // Offline play is a bonus: the game works without a service worker.
  }
  watchUpdates({
    registration,
    container: navigator.serviceWorker,
    showToast: showUpdateToast,
    reload: () => window.location.reload(),
  });
  const check = () => void registration.update().catch(() => {});
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  setInterval(check, UPDATE_CHECK_MS);
}

/** A small, dismissible banner: never forces a reload in the middle of a level. */
function showUpdateToast(onRefresh: () => void): void {
  if (document.getElementById("hh-update")) return;
  const toast = document.createElement("div");
  toast.id = "hh-update";
  toast.className = "hh-toast";
  toast.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = "✦ A new version of Hex & Hue is ready";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "hh-toast-primary";
  refresh.textContent = "Refresh";
  refresh.addEventListener("click", () => {
    refresh.disabled = true;
    onRefresh();
  });
  const later = document.createElement("button");
  later.type = "button";
  later.textContent = "Later";
  later.addEventListener("click", () => toast.remove());
  toast.append(text, refresh, later);
  document.body.append(toast);
}
