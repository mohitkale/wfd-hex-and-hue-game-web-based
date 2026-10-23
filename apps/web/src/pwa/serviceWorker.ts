/**
 * Builds the service worker from the files in the production build. It precaches the game's app
 * shell (the /play page, its bundles and the icons) and serves it cache-first, so the game starts
 * instantly and plays fully offline. Other pages (landing, blog) are cached as they are visited,
 * network-first, so content updates never wait on the game.
 *
 * A deploy that changes the shell changes `sw.js` (its version is a hash of the shell files). The
 * browser installs it in the background, copying unchanged hashed bundles from the old cache,
 * and the page offers a refresh (see updates.ts); nothing changes under a player mid-level. The
 * previous version's cache is kept for one more release, so a tab still running the old code can
 * load its lazily requested files (the hint worker) even offline.
 */

/** Pages and files that make up the playable game. Everything else is cached at runtime. */
function isShell(file: string): boolean {
  return (
    file === "play/index.html" ||
    // The v2 review board (`?engine=v2`) is a separate chunk that players of the shipped game never
    // load: precaching it would download it for everyone and change the worker version on every
    // v2 deploy. It loads over the network when asked for. Removed from this rule at the v2 switch.
    (file.startsWith("_astro/") && !file.startsWith("_astro/CollectScene.")) ||
    file.startsWith("icons/") ||
    file === "manifest.webmanifest" ||
    file === "favicon.svg"
  );
}

/** Never precached: dotfiles, host config (`_headers`, `_redirects`), source maps, the worker. */
function isSkipped(file: string): boolean {
  const name = file.slice(file.lastIndexOf("/") + 1);
  return name.startsWith(".") || /^_[^/]*$/.test(file) || file.endsWith(".map") || file === "sw.js";
}

/** Build-relative paths of the app shell, sorted (also what the version hash covers). */
export function shellFiles(files: readonly string[]): string[] {
  return files
    .map((f) => f.split("\\").join("/"))
    .filter((f) => isShell(f) && !isSkipped(f))
    .sort();
}

/** Precache URLs for shell files: `play/index.html` is cached as "/play/", what navigations ask. */
export function precacheUrls(shell: readonly string[]): string[] {
  return shell
    .map((f) => (f.endsWith("index.html") ? `/${f.slice(0, -"index.html".length)}` : `/${f}`))
    .sort();
}

/**
 * Cache keys a navigation to `pathname` may be stored under: "/play", "/play/" and
 * "/play/index.html" all mean the page "/play/". Inlined into the worker.
 */
export function pageKeys(pathname: string): string[] {
  if (pathname.endsWith("/index.html")) return [pathname.slice(0, -"index.html".length), pathname];
  return pathname.endsWith("/") ? [pathname] : [pathname, `${pathname}/`];
}

/** The worker's source code for a build. */
export function serviceWorkerSource(urls: readonly string[], version: string): string {
  return `// Generated at build time by apps/web/src/pwa/serviceWorker.ts. Do not edit.
const CACHE = "hexhue-${version}";
const PAGES = "hexhue-pages";
const META = "hexhue-meta";
const PRECACHE = ${JSON.stringify(urls)};
const pageKeys = ${pageKeys.toString()};

/** A response without the "redirected" flag (browsers refuse those for navigations). */
async function clean(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), { status: response.status, headers: response.headers });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (url) => {
          // Hashed bundles never change: reuse them from an older version's cache.
          const old = url.startsWith("/_astro/") ? await caches.match(url) : undefined;
          const response = old || (await fetch(new Request(url, { cache: "reload" })));
          if (!response.ok) throw new Error("precache failed: " + url);
          await cache.put(url, await clean(response));
        }),
      );
    })(),
  );
  // The very first install takes over at once; updates wait for the player (update toast).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Keep the version this one replaces for one more release (old tabs may still need it).
      const meta = await caches.open(META);
      const previous = await meta.match("/current").then((r) => (r ? r.text() : null));
      const keep = [CACHE, PAGES, META, previous !== CACHE ? previous : null];
      for (const key of await caches.keys()) {
        if (key.startsWith("hexhue-") && !keep.includes(key)) await caches.delete(key);
      }
      await meta.put("/current", new Response(CACHE));
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

  if (request.mode === "navigate") {
    const shellKey = pageKeys(url.pathname).find((key) => PRECACHE.includes(key));
    if (shellKey) {
      event.respondWith(caches.open(CACHE).then(async (c) => (await c.match(shellKey)) || fetch(request)));
      return;
    }
    // Other pages: fresh when online, the last visited copy when offline.
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const copy = await clean(response.clone());
            await caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(url.pathname)) || Response.error()),
    );
    return;
  }

  // Shell files from this version's cache; anything else from any cache (an old tab's bundles),
  // then the network.
  event.respondWith(
    (async () => {
      if (PRECACHE.includes(url.pathname)) {
        const hit = await caches.open(CACHE).then((c) => c.match(url.pathname));
        if (hit) return hit;
      }
      return (await caches.match(request, { ignoreSearch: true })) || fetch(request);
    })(),
  );
});
`;
}
