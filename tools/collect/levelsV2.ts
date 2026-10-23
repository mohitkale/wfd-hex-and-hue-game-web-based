/**
 * The v2 level quality gate and report (docs/V2_LEVEL_GATE.md).
 *
 *   npm run levels:report   # writes dist/levels-report.html (always; prints the gate result)
 *   npm run levels:check    # exits 1 if any level fails the gate (part of `npm run verify`)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type * as collect from "@hexhue/core/collect";
import { KNOWN_WORLD_ISSUES, POOL, type PoolLevel } from "../../content/poolV2";
import { reportHtml, reportPool, type PoolReport } from "./levelGate";
import { loadPoolLevel } from "./poolLoad";

export const OUTPUT = new URL("../../dist/levels-report.html", import.meta.url);

/** What the command does, separated from the process so it can be tested: the exit code, and the output lines. */
export function run(
  pool: readonly PoolLevel[],
  load: (id: string) => collect.CollectLevel,
  known: readonly string[],
  args: readonly string[],
  write: (html: string) => void = () => undefined,
): { code: number; out: string[]; err: string[]; report: PoolReport } {
  const report = reportPool(pool, load, known);
  const out = [
    ...report.levels.map(
      (l) =>
        `${l.id.padEnd(24)} level ${String(l.number).padStart(2)} ${l.tier.padEnd(8)} ${l.issues.filter((i) => !i.waived).length} issue(s), ${l.issues.filter((i) => i.waived).length} known`,
    ),
    `${report.levels.length} level(s), ${report.failures.length} failure(s)`,
  ];
  if (args.includes("--report")) write(reportHtml(report));
  const err = report.failures.map((failure) => `✗ ${failure}`);
  return { code: args.includes("--check") && report.failures.length > 0 ? 1 : 0, out, err, report };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const result = run(POOL, loadPoolLevel, KNOWN_WORLD_ISSUES, args, (html) => {
    mkdirSync(fileURLToPath(new URL("../../dist/", import.meta.url)), { recursive: true });
    writeFileSync(OUTPUT, html);
    console.log(`→ ${fileURLToPath(OUTPUT)}`);
  });
  for (const line of result.out) console.log(line);
  for (const line of result.err) console.error(line);
  if (result.code !== 0) process.exit(result.code);
}
