import type { AstroIntegration } from "astro";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { precacheUrls, serviceWorkerSource, shellFiles } from "./serviceWorker";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** After `astro build`: writes dist/sw.js precaching the game's app shell. */
export function pwa(): AstroIntegration {
  return {
    name: "hexhue-pwa",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const shell = shellFiles(walk(root).map((f) => relative(root, f)));
        // The version covers only the game's shell: a blog edit doesn't ask players to refresh.
        const hash = createHash("sha256");
        for (const f of shell) hash.update(f).update(readFileSync(join(root, f)));
        const urls = precacheUrls(shell);
        writeFileSync(
          join(root, "sw.js"),
          serviceWorkerSource(urls, hash.digest("hex").slice(0, 12)),
        );
        logger.info(`sw.js: ${urls.length} files precached for offline play`);
      },
    },
  };
}
