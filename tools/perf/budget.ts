/**
 * Performance budget for the production build (GAME_DESIGN §6: first playable frame < 2 s on 4G).
 * Sizes are gzip bytes (what a phone actually downloads), except `bytes` budgets: the raw size
 * of the deploy.
 */
export interface BuiltFile {
  /** Path relative to the build root, "/"-separated. */
  path: string;
  bytes: number;
  gzip: number;
  /** Whether the game page can load it (scripts only; unset when not worked out). */
  play?: boolean;
}

export interface Budget {
  label: string;
  /** Which files count towards this line. */
  match: (f: BuiltFile) => boolean;
  /** "gzip" (download) or "bytes" (raw, on disk / in the offline cache). */
  measure: "gzip" | "bytes";
  /** Limit for the matched files: each one separately, or their sum. */
  per: "file" | "total";
  max: number;
}

const KB = 1024;

export const BUDGETS: Budget[] = [
  {
    // Phaser is most of it (~390 KB gzip); the engine and scenes must stay lean around it. Since the
    // v2 switch (M15.13) the board is part of this bundle and v1 is gone.
    label: "play page JS",
    // Every script the game can load (check.ts marks the rest, the Grimoire's altar for one, with
    // `play: false`); a build without that marking counts every script.
    match: (f) => f.path.startsWith("_astro/") && /\.js$/.test(f.path) && f.play !== false,
    measure: "gzip",
    per: "total",
    max: 450 * KB,
  },
  {
    label: "each HTML page",
    match: (f) => f.path.endsWith(".html"),
    measure: "gzip",
    per: "file",
    max: 20 * KB,
  },
  {
    label: "service worker",
    match: (f) => f.path === "sw.js",
    measure: "gzip",
    per: "file",
    max: 5 * KB,
  },
  {
    label: "whole build (deploy size)",
    match: () => true,
    measure: "bytes",
    per: "total",
    max: 3 * KB * KB,
  },
];

export interface BudgetResult {
  label: string;
  /** The largest measured value (one file, or the total). */
  value: number;
  max: number;
  ok: boolean;
  /** For per-file budgets, the file that measured `value`. */
  file?: string;
}

export function checkBudgets(files: readonly BuiltFile[], budgets = BUDGETS): BudgetResult[] {
  return budgets.map((b) => {
    const matched = files.filter(b.match);
    if (b.per === "total") {
      const value = matched.reduce((n, f) => n + f[b.measure], 0);
      return { label: b.label, value, max: b.max, ok: value <= b.max };
    }
    const worst = matched.reduce<BuiltFile | null>(
      (w, f) => (!w || f[b.measure] > w[b.measure] ? f : w),
      null,
    );
    const value = worst ? worst[b.measure] : 0;
    return {
      label: b.label,
      value,
      max: b.max,
      ok: value <= b.max,
      ...(worst ? { file: worst.path } : {}),
    };
  });
}

/**
 * Pages with inline executable scripts. The CSP allows only same-origin script files (no
 * 'unsafe-inline'), so any such script would be blocked in production. JSON-LD data is fine.
 */
export function inlineScripts(pages: readonly { path: string; html: string }[]): string[] {
  return pages
    .filter((p) =>
      [...p.html.matchAll(/<script\b([^>]*)>/g)].some(
        (m) => !/\ssrc=/.test(m[1]!) && !/type="application\/ld\+json"/.test(m[1]!),
      ),
    )
    .map((p) => p.path);
}

/** A content page may load at most this much script (gzip), static imports included. */
export const CONTENT_SCRIPT_MAX = 10 * 1024;

/** Build-relative paths of the `_astro` script bundles a page's HTML loads. */
export function pageScripts(html: string): string[] {
  return [...html.matchAll(/<script[^>]*\ssrc="\/(_astro\/[^"]+\.js)"/g)].map((m) => m[1]!);
}

/**
 * `entries` plus every bundle they statically import (relative "./x.js" imports in _astro), and
 * with `dynamic` also those they load later with `import("./x.js")`.
 */
export function scriptClosure(
  entries: readonly string[],
  code: (path: string) => string,
  dynamic = false,
): string[] {
  const seen = new Set<string>();
  const pattern = dynamic
    ? /(?:from|import)\s*\(?\s*["']\.\/([^"']+\.js)["']/g
    : /(?:from|import)\s*["']\.\/([^"']+\.js)["']/g;
  const visit = (path: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const m of code(path).matchAll(pattern)) visit(`_astro/${m[1]}`);
  };
  entries.forEach(visit);
  return [...seen];
}

/**
 * Content pages (everything but the game) must stay light: the game's Phaser bundle above all
 * must never load there. Returns the pages whose scripts, imports included, exceed the limit.
 */
export function scriptLeaks(
  pages: readonly { path: string; html: string }[],
  bundles: ReadonlyMap<string, { gzip: number; code: string }>,
  max = CONTENT_SCRIPT_MAX,
): { page: string; gzip: number }[] {
  return pages
    .filter((p) => p.path !== "play/index.html")
    .map((p) => {
      const all = scriptClosure(pageScripts(p.html), (path) => bundles.get(path)?.code ?? "");
      return { page: p.path, gzip: all.reduce((n, f) => n + (bundles.get(f)?.gzip ?? 0), 0) };
    })
    .filter((r) => r.gzip > max);
}
