/**
 * Analytics consent, shared by the page's consent banner (apps/web) and the game's settings.
 * Nothing is sent until the player says yes; a browser privacy signal (Global Privacy Control or
 * Do Not Track) counts as no, and the banner isn't even shown.
 */
export type Consent = "unknown" | "granted" | "denied";

export const CONSENT_KEY = "hexhue:analytics-consent";
/** Fired on `window` whenever consent changes (the game's provider listens). */
export const CONSENT_EVENT = "hexhue:consent";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface NavigatorLike {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
}

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // storage blocked (private mode, sandboxed iframe)
  }
};
const defaultNavigator = (): NavigatorLike | null =>
  typeof navigator !== "undefined" ? (navigator as NavigatorLike) : null;

/** The browser asks sites not to track: honoured as a standing "no". */
export function privacySignal(nav: NavigatorLike | null = defaultNavigator()): boolean {
  return nav?.globalPrivacyControl === true || nav?.doNotTrack === "1";
}

export function readConsent(
  storage: StorageLike | null = defaultStorage(),
  nav: NavigatorLike | null = defaultNavigator(),
): Consent {
  if (privacySignal(nav)) return "denied";
  try {
    const v = storage?.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : "unknown";
  } catch {
    return "unknown";
  }
}

export function writeConsent(
  consent: Exclude<Consent, "unknown">,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(CONSENT_KEY, consent);
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CONSENT_EVENT));
}
