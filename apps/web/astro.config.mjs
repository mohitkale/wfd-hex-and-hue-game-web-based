import { env } from "node:process";
import { defineConfig } from "astro/config";
import { pwa } from "./src/pwa/integration.ts";

export default defineConfig({
  // Canonical links, share cards and the sitemap use this. Netlify sets URL at build; elsewhere set
  // SITE_URL (see docs/DEPLOY.md).
  site: env.SITE_URL || env.URL || "https://hexandhue.example",
  integrations: [pwa()],
  vite: {
    build: {
      // Phaser is one large chunk by design; it is only loaded on /play.
      chunkSizeWarningLimit: 2000,
    },
  },
});
