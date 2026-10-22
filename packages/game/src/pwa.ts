/**
 * The browser's "install app" prompt, captured by the page (apps/web/src/pwa/client.ts) and kept
 * on `window.__hexhueInstall` so the game can offer installing at a good moment.
 */
interface InstallPrompt {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const holder = (): { __hexhueInstall?: InstallPrompt | undefined } | null =>
  typeof window === "undefined"
    ? null
    : (window as unknown as { __hexhueInstall?: InstallPrompt | undefined });

/** Wins before the map offers installing: only once the player is enjoying the game. */
export const INSTALL_AFTER_WINS = 2;

export function canInstall(): boolean {
  return !!holder()?.__hexhueInstall;
}

/** Shows the browser's install dialog (once: browsers allow each prompt a single use). */
export async function promptInstall(): Promise<boolean> {
  const h = holder();
  const prompt = h?.__hexhueInstall;
  if (!h || !prompt) return false;
  h.__hexhueInstall = undefined;
  try {
    await prompt.prompt();
    return (await prompt.userChoice).outcome === "accepted";
  } catch {
    return false;
  }
}

/** Calls `listener` when installing becomes available or unavailable; returns an unsubscribe. */
export function onInstallChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("hexhue:installable", listener);
  return () => window.removeEventListener("hexhue:installable", listener);
}
