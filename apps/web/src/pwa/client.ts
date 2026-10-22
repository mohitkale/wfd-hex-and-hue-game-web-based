/**
 * Page side of the PWA: registers the service worker (production builds only), offers a refresh
 * when a new version is ready, and keeps the browser's install prompt for the game to show at a
 * good moment (window.__hexhueInstall, read by packages/game/src/pwa.ts).
 */

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __hexhueInstall?: InstallPrompt | undefined;
  }
}

/** How often a long-open tab checks for a new deploy. */
const UPDATE_CHECK_MS = 30 * 60 * 1000;

export function setupPwa(): void {
  captureInstallPrompt();
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => void register());
}

function captureInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Hold the browser's mini-infobar back; the game offers installing once the player is hooked.
    e.preventDefault();
    window.__hexhueInstall = e as InstallPrompt;
    window.dispatchEvent(new Event("hexhue:installable"));
  });
  window.addEventListener("appinstalled", () => {
    window.__hexhueInstall = undefined;
    window.dispatchEvent(new Event("hexhue:installable"));
  });
}

async function register(): Promise<void> {
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("/sw.js");
  } catch {
    return; // Offline play is a bonus: the game works without a service worker.
  }
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Only reload when the player asked for the new version (not on the very first install).
    if (refreshing) window.location.reload();
  });
  const offer = (worker: ServiceWorker) =>
    showUpdateToast(() => {
      refreshing = true;
      worker.postMessage("skipWaiting");
    });
  // An update is only "new" if a previous version controls this page.
  if (registration.waiting && navigator.serviceWorker.controller) offer(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) offer(worker);
    });
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
