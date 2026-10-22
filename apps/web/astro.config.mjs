import { defineConfig } from "astro/config";
import { pwa } from "./src/pwa/integration.ts";

export default defineConfig({
  site: "https://hexandhue.example",
  integrations: [pwa()],
  vite: {
    build: {
      // Phaser is one large chunk by design; it is only loaded on /play.
      chunkSizeWarningLimit: 2000,
    },
  },
});
