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
    build: {
      // Phaser is one large chunk by design; it is only loaded on /play.
      chunkSizeWarningLimit: 2000,
    },
  },
});
