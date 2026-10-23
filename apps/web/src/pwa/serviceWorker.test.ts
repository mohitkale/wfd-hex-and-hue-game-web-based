import { describe, expect, it, vi } from "vitest";
import { pageKeys, precacheUrls, serviceWorkerSource, shellFiles } from "./serviceWorker";

describe("service worker build", () => {
  it("precaches only the game's shell, pages under their directory URL", () => {
    const shell = shellFiles([
      "index.html",
      "blog/first-post/index.html",
      "play/index.html",
      "_astro/play.abc.js",
      "_astro/hint.worker-x.js",
      "_astro/play.abc.js.map",
      "icons/icon-192.png",
      "manifest.webmanifest",
      "favicon.svg",
      "sw.js",
      "_headers",
      "_redirects",
      "icons/.DS_Store",
      "og/cover.png",
    ]);
    expect(precacheUrls(shell)).toEqual([
      "/_astro/hint.worker-x.js",
      "/_astro/play.abc.js",
      "/favicon.svg",
      "/icons/icon-192.png",
      "/manifest.webmanifest",
      "/play/",
    ]);
  });

  it("never precaches the v2 review board chunk, so shipped-game players neither download it nor see its deploys as updates", () => {
    const files = ["play/index.html", "_astro/play.abc.js", "_astro/CollectScene.9xYz.js"];
    expect(shellFiles(files)).toEqual(["_astro/play.abc.js", "play/index.html"]);
    // Changing only the v2 chunk leaves the shell (and so the worker's version hash input) the same.
    expect(shellFiles(files)).toEqual(shellFiles(files.map((f) => f.replace("9xYz", "Qq12"))));
  });

  it("maps navigations to their page keys", () => {
    expect(pageKeys("/play")).toEqual(["/play", "/play/"]);
    expect(pageKeys("/play/")).toEqual(["/play/"]);
    expect(pageKeys("/play/index.html")).toEqual(["/play/", "/play/index.html"]);
    expect(pageKeys("/blog/v1.2-notes")).toEqual(["/blog/v1.2-notes", "/blog/v1.2-notes/"]);
  });

  it("generates valid JavaScript whose cache name follows the build version", () => {
    const src = serviceWorkerSource(["/play/"], "abc123");
    expect(() => new Function(src)).not.toThrow();
    expect(src).toContain('"hexhue-abc123"');
    expect(serviceWorkerSource(["/play/"], "v2")).not.toBe(src);
  });
});

// ── Runtime: the generated worker against fake caches and network ──────────

type Req = { url: string; method: string; mode: string };
const keyOf = (r: string | Req) => (typeof r === "string" ? r : new URL(r.url).pathname);

class FakeCache {
  entries = new Map<string, Response>();
  async match(r: string | Req) {
    return this.entries.get(keyOf(r))?.clone();
  }
  async put(r: string | Req, res: Response) {
    this.entries.set(keyOf(r), res);
  }
}

class FakeCaches {
  stores = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return this.stores.get(name)!;
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
  async match(r: string | Req) {
    for (const c of this.stores.values()) {
      const hit = await c.match(r);
      if (hit) return hit;
    }
    return undefined;
  }
}

const ORIGIN = "https://hexandhue.test";
const SHELL = ["/_astro/play.abc.js", "/manifest.webmanifest", "/play/"];

/** Loads a generated worker; `network` answers fetches (undefined = offline). */
function boot(version: string, caches: FakeCaches, network: Record<string, string | number>) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const fetchMock = vi.fn(async (r: string | Req | Request) => {
    const path = typeof r === "string" ? r : new URL(r.url, ORIGIN).pathname;
    const body = network[path];
    if (body === undefined) throw new TypeError("offline");
    return typeof body === "number"
      ? new Response("", { status: body })
      : new Response(body, { status: 200 });
  });
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
  };
  // Relative URLs in `new Request` need a base; the worker only builds them for precache fetches.
  class BaseRequest extends Request {
    constructor(url: string, init?: RequestInit) {
      super(new URL(url, ORIGIN), init);
    }
  }
  new Function("self", "caches", "fetch", "Request", serviceWorkerSource(SHELL, version))(
    self,
    caches,
    fetchMock,
    BaseRequest,
  );
  const lifecycle = async (type: "install" | "activate") => {
    let done: Promise<unknown> = Promise.resolve();
    handlers[type]!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  const get = async (path: string, mode = "no-cors") => {
    let response: Promise<Response> | undefined;
    handlers.fetch!({
      request: { url: ORIGIN + path, method: "GET", mode },
      respondWith: (r: Promise<Response>) => (response = r),
    });
    return response ? (await response).text() : "passthrough";
  };
  const dispatch = (type: string, event: unknown) => handlers[type]!(event);
  return { lifecycle, get, dispatch, fetchMock, self };
}

const site = {
  "/_astro/play.abc.js": "game v1",
  "/manifest.webmanifest": "{}",
  "/play/": "<play>",
};

describe("service worker runtime", () => {
  it("installs the shell, then serves the game offline for any /play URL form", async () => {
    const caches = new FakeCaches();
    const sw = boot("v1", caches, site);
    await sw.lifecycle("install");
    await sw.lifecycle("activate");
    expect([...caches.stores.get("hexhue-v1")!.entries.keys()].sort()).toEqual(SHELL);

    const offline = boot("v1", caches, {});
    expect(await offline.get("/play", "navigate")).toBe("<play>");
    expect(await offline.get("/play/?utm_source=x", "navigate")).toBe("<play>");
    expect(await offline.get("/play/index.html", "navigate")).toBe("<play>");
    expect(await offline.get("/_astro/play.abc.js")).toBe("game v1");
    expect(offline.fetchMock).not.toHaveBeenCalled();
  });

  it("fails the install (keeping the old version) if any shell file can't be fetched", async () => {
    const sw = boot("v1", new FakeCaches(), { ...site, "/manifest.webmanifest": 404 });
    await expect(sw.lifecycle("install")).rejects.toThrow(/manifest/);
  });

  it("reuses unchanged hashed bundles from the previous version instead of downloading", async () => {
    const caches = new FakeCaches();
    const v1 = boot("v1", caches, site);
    await v1.lifecycle("install");
    await v1.lifecycle("activate");
    const v2 = boot("v2", caches, { ...site, "/play/": "<play v2>" });
    await v2.lifecycle("install");
    const fetched = v2.fetchMock.mock.calls.map(([r]) => new URL((r as Request).url).pathname);
    expect(fetched.sort()).toEqual(["/manifest.webmanifest", "/play/"]);
  });

  it("keeps exactly one previous version's cache, so old tabs still find their files", async () => {
    const caches = new FakeCaches();
    for (const v of ["v1", "v2", "v3"]) {
      const sw = boot(v, caches, { ...site, [`/_astro/old-${v}.js`]: v });
      await sw.lifecycle("install");
      await caches.open(`hexhue-${v}`).then((c) => c.put(`/_astro/old-${v}.js`, new Response(v)));
      await sw.lifecycle("activate");
    }
    const names = await caches.keys();
    expect(names).toContain("hexhue-v3");
    expect(names).toContain("hexhue-v2");
    expect(names).not.toContain("hexhue-v1");
    // A tab still running v2 asks for its (no longer precached) bundle while offline.
    const offline = boot("v3", caches, {});
    expect(await offline.get("/_astro/old-v2.js")).toBe("v2");
  });

  it("serves other pages fresh when online and the last copy when offline", async () => {
    const caches = new FakeCaches();
    const online = boot("v1", caches, { ...site, "/": "<landing>" });
    expect(await online.get("/", "navigate")).toBe("<landing>");
    const offline = boot("v1", caches, {});
    expect(await offline.get("/", "navigate")).toBe("<landing>");
    // Never visited, no network: the browser's own offline error page.
    let response: Promise<Response> | undefined;
    offline.dispatch("fetch", {
      request: { url: ORIGIN + "/blog/unvisited/", method: "GET", mode: "navigate" },
      respondWith: (r: Promise<Response>) => (response = r),
    });
    expect((await response!).type).toBe("error");
  });

  it("leaves other origins and non-GET requests to the network", () => {
    const sw = boot("v1", new FakeCaches(), site);
    const respondWith = vi.fn();
    sw.dispatch("fetch", {
      request: { url: "https://cdn.example/x.js", method: "GET", mode: "no-cors" },
      respondWith,
    });
    sw.dispatch("fetch", {
      request: { url: ORIGIN + "/play/", method: "POST", mode: "cors" },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("activates an update only when the page asks", () => {
    const sw = boot("v1", new FakeCaches(), site);
    sw.dispatch("message", { data: "hello" });
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
    sw.dispatch("message", { data: "skipWaiting" });
    expect(sw.self.skipWaiting).toHaveBeenCalledOnce();
  });
});
