import { type Consent, readConsent } from "./consent";
import type { AnalyticsProvider, EventName, EventProps } from "./types";

/** No analytics (the default, and whenever no provider key is configured). */
export class NoneAnalytics implements AnalyticsProvider {
  readonly name = "none";
  track(): void {}
  flush(): void {}
}

export const ANON_ID_KEY = "hexhue:anon-id";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PostHogOptions {
  apiKey: string;
  /** e.g. https://eu.i.posthog.com */
  host: string;
  consent?: () => Consent;
  fetch?: (url: string, init: { method: string; body: string; keepalive: boolean }) => unknown;
  beacon?: (url: string, body: string) => boolean;
  storage?: StorageLike | null;
  now?: () => number;
  randomId?: () => string;
  /** Send once this many events are queued. */
  maxBatch?: number;
}

const safeStorage = (): StorageLike | null => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

/**
 * PostHog over its plain HTTP batch API (no SDK, no cookies). Events are queued and sent in
 * batches; with consent missing or withdrawn, nothing is recorded or sent, and the anonymous id is
 * deleted. The id is a random UUID kept in local storage, created only once consent is given.
 */
export class PostHogAnalytics implements AnalyticsProvider {
  readonly name = "posthog";
  private queue: { event: string; properties: Record<string, unknown>; timestamp: string }[] = [];
  private readonly o: Required<Omit<PostHogOptions, "storage">> & { storage: StorageLike | null };

  constructor(options: PostHogOptions) {
    this.o = {
      consent: () => readConsent(),
      fetch: (url, init) =>
        typeof fetch === "function" ? fetch(url, init).catch(() => undefined) : undefined,
      beacon: (url, body) =>
        typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
          ? navigator.sendBeacon(url, body)
          : false,
      storage: safeStorage(),
      now: () => Date.now(),
      randomId: () =>
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      maxBatch: 20,
      ...options,
      host: options.host.replace(/\/$/, ""),
    };
  }

  track<E extends EventName>(event: E, props: EventProps[E]): void {
    if (this.o.consent() !== "granted") {
      this.forget();
      return;
    }
    this.queue.push({
      event,
      properties: { ...props, distinct_id: this.anonymousId(), $lib: "hexhue-web" },
      timestamp: new Date(this.o.now()).toISOString(),
    });
    if (this.queue.length >= this.o.maxBatch) this.flush();
  }

  flush(beacon = false): void {
    if (this.queue.length === 0) return;
    if (this.o.consent() !== "granted") return this.forget();
    const body = JSON.stringify({ api_key: this.o.apiKey, batch: this.queue });
    this.queue = [];
    const url = `${this.o.host}/batch/`;
    // On page hide, a beacon survives the unload; otherwise a keepalive fetch. Failures are
    // dropped: analytics must never affect play.
    if (beacon && this.o.beacon(url, body)) return;
    void this.o.fetch(url, { method: "POST", body, keepalive: true });
  }

  /** Consent withdrawn (or never given): drop queued events and the anonymous id. */
  private forget(): void {
    this.queue = [];
    try {
      this.o.storage?.removeItem(ANON_ID_KEY);
    } catch {
      // ignore
    }
  }

  private anonymousId(): string {
    try {
      const stored = this.o.storage?.getItem(ANON_ID_KEY);
      if (stored) return stored;
      const id = this.o.randomId();
      this.o.storage?.setItem(ANON_ID_KEY, id);
      return id;
    } catch {
      return "anonymous";
    }
  }
}

export interface AnalyticsEnv {
  PUBLIC_POSTHOG_KEY?: string | undefined;
  PUBLIC_POSTHOG_HOST?: string | undefined;
}

/** PostHog when a key is configured; otherwise no analytics at all. */
export function createAnalytics(env: AnalyticsEnv): AnalyticsProvider {
  const key = env.PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return new NoneAnalytics();
  return new PostHogAnalytics({
    apiKey: key,
    host: env.PUBLIC_POSTHOG_HOST?.trim() || "https://eu.i.posthog.com",
  });
}
