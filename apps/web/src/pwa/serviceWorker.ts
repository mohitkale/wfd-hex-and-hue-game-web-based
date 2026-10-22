/**
 * Builds the service worker from the list of files in the production build. It is an app shell:
 * every built file is precached at install, then served cache-first, so the game starts instantly
 * and plays fully offline. A new deploy changes `sw.js` (its version is a hash of all files), the
 * browser installs it in the background, and the page offers a refresh (see client.ts); nothing
 * changes under a player mid-level.
 */

/** Files never precached: the worker itself, and source maps. */
const SKIP = [/^sw\.js$/, /\.map$/];

/**
 * Turns build-relative file paths into the URLs to precache. `index.html` files are cached under
 * their directory URL ("/play/"), which is what navigations request.
 */
export function precacheUrls(files: readonly string[]): string[] {
  return files
    .map((f) => f.split("\\").join("/"))
    .filter((f) => !SKIP.some((re) => re.test(f)))
    .map((f) => {
      if (f === "index.html") return "/";
      if (f.endsWith("/index.html")) return `/${f.slice(0, -"index.html".length)}`;
      return `/${f}`;
    })
    .sort();
}

/**
 * The precache key for a navigation: "/play" and "/play/" both map to "/play/", query strings
 * are ignored. Shared with the worker (inlined into its source).
 */
export function pageKey(pathname: string): string {
  if (pathname.endsWith("/")) return pathname;
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return last.includes(".") ? pathname : `${pathname}/`;
}

/** The worker's source code for a build. */
export function serviceWorkerSource(urls: readonly string[], version: string): string {
  return `// Generated at build time by apps/web/src/pwa/serviceWorker.ts. Do not edit.
const CACHE = "hexhue-${version}";
const PRECACHE = ${JSON.stringify(urls)};
const pageKey = ${pageKey.toString()};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })))),
  );
  // The very first install takes over at once; updates wait for the player (update toast).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("hexhue-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const key = request.mode === "navigate" ? pageKey(url.pathname) : url.pathname;
  if (!PRECACHE.includes(key)) return; // not part of the app shell: plain network
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(key);
      return hit || fetch(request);
    }),
  );
});
`;
}
