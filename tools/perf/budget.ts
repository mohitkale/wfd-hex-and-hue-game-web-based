/**
 * Performance budget for the production build (GAME_DESIGN §6: first playable frame < 2 s on 4G).
 * Sizes are gzip bytes, what a phone actually downloads, except `total`, which is raw bytes
 * precached for offline play.
 */
export interface BuiltFile {
  /** Path relative to the build root, "/"-separated. */
  path: string;
  bytes: number;
  gzip: number;
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
    // Phaser is most of it (~390 KB gzip); the engine and scenes must stay lean around it.
    label: "play page JS",
    match: (f) => f.path.startsWith("_astro/") && /\.js$/.test(f.path) && !/worker/.test(f.path),
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
    label: "hint worker",
    match: (f) => /worker.*\.js$/.test(f.path),
    measure: "gzip",
    per: "file",
    max: 10 * KB,
  },
  {
    label: "service worker",
    match: (f) => f.path === "sw.js",
    measure: "gzip",
    per: "file",
    max: 5 * KB,
  },
  {
    label: "whole build (offline cache)",
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
