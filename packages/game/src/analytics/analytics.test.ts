import { describe, expect, it, vi } from "vitest";
import { CONSENT_KEY, privacySignal, readConsent, writeConsent, type Consent } from "./consent";
import {
  ANON_ID_KEY,
  NoneAnalytics,
  PostHogAnalytics,
  createAnalytics,
  type PostHogOptions,
} from "./providers";
import { track } from "./index";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    map: m,
  };
}

describe("consent", () => {
  it("is unknown until chosen, then remembered", () => {
    const s = memoryStorage();
    expect(readConsent(s, {})).toBe("unknown");
    writeConsent("granted", s);
    expect(readConsent(s, {})).toBe("granted");
    s.setItem(CONSENT_KEY, "junk");
    expect(readConsent(s, {})).toBe("unknown");
  });

  it("a browser privacy signal is a standing no", () => {
    const s = memoryStorage();
    s.setItem(CONSENT_KEY, "granted");
    expect(privacySignal({ globalPrivacyControl: true })).toBe(true);
    expect(readConsent(s, { globalPrivacyControl: true })).toBe("denied");
    expect(readConsent(s, { doNotTrack: "1" })).toBe("denied");
    expect(readConsent(null, {})).toBe("unknown");
  });
});

function posthog(consent: Consent, extra: Partial<PostHogOptions> = {}) {
  const storage = memoryStorage();
  const fetch = vi.fn();
  const beacon = vi.fn(() => true);
  let current = consent;
  const ph = new PostHogAnalytics({
    apiKey: "phc_test",
    host: "https://eu.i.posthog.com/",
    consent: () => current,
    fetch,
    beacon,
    storage,
    now: () => Date.UTC(2026, 9, 22),
    randomId: () => "anon-1",
    maxBatch: 3,
    ...extra,
  });
  return { ph, fetch, beacon, storage, setConsent: (c: Consent) => (current = c) };
}

describe("PostHog over HTTP", () => {
  it("records nothing and creates no id without consent", () => {
    const t = posthog("unknown");
    t.ph.track("level_start", { level: "moonlit-01", replay: false });
    t.ph.flush();
    expect(t.fetch).not.toHaveBeenCalled();
    expect(t.storage.map.has(ANON_ID_KEY)).toBe(false);
  });

  it("batches events with an anonymous id and sends them to /batch/", () => {
    const t = posthog("granted");
    t.ph.track("level_start", { level: "moonlit-01", replay: false });
    t.ph.track("level_win", { level: "moonlit-01", stars: 3, assists: 0, seconds: 41 });
    expect(t.fetch).not.toHaveBeenCalled();
    t.ph.track("level_start", { level: "moonlit-02", replay: false }); // 3rd: batch full
    expect(t.fetch).toHaveBeenCalledOnce();
    const [url, init] = t.fetch.mock.calls[0]!;
    expect(url).toBe("https://eu.i.posthog.com/batch/");
    const body = JSON.parse(init.body);
    expect(body.api_key).toBe("phc_test");
    expect(body.batch).toHaveLength(3);
    expect(body.batch[1]).toMatchObject({
      event: "level_win",
      properties: { level: "moonlit-01", stars: 3, distinct_id: "anon-1" },
      timestamp: "2026-10-22T00:00:00.000Z",
    });
    expect(t.storage.map.get(ANON_ID_KEY)).toBe("anon-1");
  });

  it("uses a beacon when the page is going away", () => {
    const t = posthog("granted");
    t.ph.track("app_open", { standalone: true });
    t.ph.flush(true);
    expect(t.beacon).toHaveBeenCalledOnce();
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it("withdrawing consent drops queued events and the anonymous id", () => {
    const t = posthog("granted");
    t.ph.track("app_open", { standalone: false });
    t.setConsent("denied");
    t.ph.flush();
    expect(t.fetch).not.toHaveBeenCalled();
    expect(t.storage.map.has(ANON_ID_KEY)).toBe(false);
  });
});

describe("provider selection", () => {
  it("no key means no analytics", () => {
    expect(createAnalytics({}).name).toBe("none");
    expect(createAnalytics({ PUBLIC_POSTHOG_KEY: "  " }).name).toBe("none");
    expect(createAnalytics({ PUBLIC_POSTHOG_KEY: "phc_x" }).name).toBe("posthog");
  });

  it("track() never throws, even if a provider does", () => {
    const broken = new NoneAnalytics();
    broken.track = () => {
      throw new Error("boom");
    };
    const scene = { registry: { get: () => broken } };
    expect(() => track(scene, "level_skip", { level: "x" })).not.toThrow();
  });
});
