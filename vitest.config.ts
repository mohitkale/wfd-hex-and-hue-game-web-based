import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The random-game property tests are CPU heavy; a loaded CI machine must not time them out.
    testTimeout: 30_000,
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
      "tools/**/*.test.ts",
      "content/**/*.test.ts",
    ],
  },
});
