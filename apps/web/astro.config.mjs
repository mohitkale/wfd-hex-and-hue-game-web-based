import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://hexandhue.example",
  vite: {
    build: {
      // Phaser is one large chunk by design; it is only loaded on /play.
      chunkSizeWarningLimit: 2000,
    },
  },
});
