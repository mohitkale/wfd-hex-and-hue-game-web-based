import { describe, expect, it, vi } from "vitest";
import {
  ANON_ID_KEY,
  CONSENT_KEY,
  privacySignal,
  readConsent,
  writeConsent,
  type Consent,
} from "./consent";
import { NoneAnalytics, PostHogAnalytics, createAnalytics, type PostHogOptions } from "./providers";
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
    t.ph.track("play_start", { level: "j-candle", kind: "picture", replay: false });
    t.ph.flush();
    expect(t.fetch).not.toHaveBeenCalled();
    expect(t.storage.map.has(ANON_ID_KEY)).toBe(false);
  });

  it("batches events with an anonymous id and sends them to /batch/", () => {
    const t = posthog("granted");
    t.ph.track("play_start", { level: "j-candle", kind: "picture", replay: false });
    t.ph.track("play_win", { level: "j-candle", seconds: 41, moves: 12, boosters: 0 });
    expect(t.fetch).not.toHaveBeenCalled();
    t.ph.track("play_start", { level: "j-witchs-hat", kind: "picture", replay: false }); // 3rd: batch full
    expect(t.fetch).toHaveBeenCalledOnce();
    const [url, init] = t.fetch.mock.calls[0]!;
    expect(url).toBe("https://eu.i.posthog.com/batch/");
    const body = JSON.parse(init.body);
    expect(body.api_key).toBe("phc_test");
    expect(body.batch).toHaveLength(3);
    expect(body.batch[1]).toMatchObject({
      event: "play_win",
      properties: {
        level: "j-candle",
        moves: 12,
        distinct_id: "anon-1",
        $lib: "hexhue-web",
        $geoip_disable: true,
        $process_person_profile: false,
      },
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

describe("consent withdrawal and ids", () => {
  it("saying no deletes the anonymous id at once, even with nothing queued", () => {
    const t = posthog("granted");
    t.ph.track("app_open", { standalone: false });
    t.ph.flush();
    expect(t.storage.map.has(ANON_ID_KEY)).toBe(true);
    t.setConsent("denied");
    t.ph.flush(); // empty queue: still forgets
    expect(t.storage.map.has(ANON_ID_KEY)).toBe(false);

    const s = memoryStorage();
    s.setItem(ANON_ID_KEY, "x");
    writeConsent("denied", s);
    expect(s.map.has(ANON_ID_KEY)).toBe(false);
  });

  it("falls back to fetch when the beacon is refused", () => {
    const t = posthog("granted", { beacon: () => false });
    t.ph.track("app_open", { standalone: false });
    t.ph.flush(true);
    expect(t.fetch).toHaveBeenCalledOnce();
  });

  it("keeps one id per player across visits, and a unique one when storage is blocked", () => {
    const shared = memoryStorage();
    let n = 0;
    const make = (storage: NonNullable<PostHogOptions["storage"]>) =>
      posthog("granted", { storage, randomId: () => `id-${++n}`, maxBatch: 1 });
    const a = make(shared);
    a.ph.track("app_open", { standalone: false });
    const b = make(shared);
    b.ph.track("app_open", { standalone: false });
    const id = (t: ReturnType<typeof make>) =>
      JSON.parse(t.fetch.mock.calls[0]![1].body).batch[0].properties.distinct_id;
    expect(id(a)).toBe("id-1");
    expect(id(b)).toBe("id-1");

    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    const c = make(blocked);
    c.ph.track("app_open", { standalone: false });
    expect(id(c)).toBe("id-2");
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
    expect(() =>
      track(scene, "play_retry", { level: "x", after: "lost", seconds: 1 }),
    ).not.toThrow();
  });
});
