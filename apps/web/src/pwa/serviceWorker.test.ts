import { describe, expect, it } from "vitest";
import { pageKey, precacheUrls, serviceWorkerSource } from "./serviceWorker";

describe("service worker", () => {
  it("precaches every built file, pages under their directory URL", () => {
    expect(
      precacheUrls([
        "index.html",
        "play/index.html",
        "_astro/play.abc.js",
        "_astro/hint.worker-x.js",
        "icons/icon-192.png",
        "manifest.webmanifest",
        "sw.js",
        "_astro/play.abc.js.map",
      ]),
    ).toEqual([
      "/",
      "/_astro/hint.worker-x.js",
      "/_astro/play.abc.js",
      "/icons/icon-192.png",
      "/manifest.webmanifest",
      "/play/",
    ]);
  });

  it("maps navigations to their page", () => {
    expect(pageKey("/play")).toBe("/play/");
    expect(pageKey("/play/")).toBe("/play/");
    expect(pageKey("/")).toBe("/");
    expect(pageKey("/manifest.webmanifest")).toBe("/manifest.webmanifest");
  });

  it("generates valid JavaScript whose cache name follows the build version", () => {
    const src = serviceWorkerSource(["/", "/play/"], "abc123");
    expect(() => new Function(src)).not.toThrow();
    expect(src).toContain('"hexhue-abc123"');
    expect(src).toContain('["/","/play/"]');
    expect(serviceWorkerSource(["/"], "v2")).not.toBe(serviceWorkerSource(["/"], "v1"));
  });
});
