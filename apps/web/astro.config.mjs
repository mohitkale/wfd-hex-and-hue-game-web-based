import { warn } from "node:console";
import { env } from "node:process";
import { defineConfig } from "astro/config";
import { PLACEHOLDER_SITE } from "./src/lib/site.ts";
import { pwa } from "./src/pwa/integration.ts";

// Canonical links, share cards and the sitemap use this. Netlify sets URL at build; elsewhere set
// SITE_URL (the Docker / VPS build passes it; see docs/DEPLOY.md).
const site = env.SITE_URL || env.URL || PLACEHOLDER_SITE;
if (site === PLACEHOLDER_SITE && (env.CI || env.NODE_ENV === "production")) {
  warn(`[hexhue] No SITE_URL or URL set: links and share cards will use ${site}.`);
}

/**
 * The v2 review board (`?engine=v2`) is a lazily loaded chunk. Its file name must not carry a content
 * hash: the play bundle embeds the name it imports, so a hashed name would change the shipped bundle
 * (and the service worker version, and so every player's "update available" prompt) on every v2-only
 * deploy. It lives outside `_astro/` (whose files are precached and cached forever) and is served
 * `no-cache` (public/_headers, deploy/nginx). Astro assembles its own output options, so this
 * overrides them from a Rollup plugin. Removed at the v2 switch (roadmap M15.5); tools/perf/check.ts
 * fails the build if the name or location changes.
 */
function stableV2Chunk() {
  return {
    name: "hexhue-stable-v2-chunk",
    outputOptions(options) {
      const previous = options.chunkFileNames;
      return {
        ...options,
        chunkFileNames: (chunk) =>
          chunk.name === "CollectScene"
            ? "v2/CollectScene.js"
            : typeof previous === "function"
              ? previous(chunk)
              : (previous ?? "_astro/[name].[hash].js"),
      };
    },
  };
}

export default defineConfig({
  site,
  // Directory URLs everywhere ("/faq/"), matching the built files and canonical links.
  trailingSlash: "always",
  build: {
    // Content-page CSS stays inline, so _astro/ only holds the game's shell (pwa/serviceWorker.ts).
    inlineStylesheets: "always",
  },
  integrations: [pwa()],
  vite: {
    plugins: [stableV2Chunk()],
    build: {
      // Phaser is one large chunk by design; it is only loaded on /play.
      chunkSizeWarningLimit: 2000,
    },
  },
});
