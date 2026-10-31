import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.astro/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["packages/core/**/*.ts", "packages/learn/**/*.ts"],
    rules: {
      // The engine must stay deterministic: use the seeded RNG and step counters instead.
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use createRng() from core/rng." },
        { object: "Date", property: "now", message: "Core logic must not read wall-clock time." },
      ],
    },
  },
);
