/**
 * Checks every v2 art piece in content/v2art against the art bible (docs/ART_DIRECTION_V2.md):
 * the machine-checkable rules A-01..A-34 and the provenance rules (author, licence, source,
 * review). Fails (exit 1) on any error; warnings are listed but do not fail.
 *
 *   npm run art:check             # the library
 *   npm run art:check -- --all    # also print every passing rule
 */
import { pathToFileURL } from "node:url";
import { pieces, SHIPPED } from "../../content/v2art";
import type { ArtPiece } from "./piece";
import { checkPiece, type Report } from "./rules";

export interface LibraryReport {
  reports: Report[];
  /** Problems with the library as a whole (duplicate ids, shipped ids that do not exist). */
  problems: string[];
  ok: boolean;
}

export function checkLibrary(
  library: readonly ArtPiece[],
  shipped: readonly string[] = [],
): LibraryReport {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const piece of library) {
    if (ids.has(piece.id)) problems.push(`duplicate piece id "${piece.id}"`);
    ids.add(piece.id);
  }
  for (const id of shipped) if (!ids.has(id)) problems.push(`shipped piece "${id}" does not exist`);
  const reports = library.map((p) => checkPiece(p, { shipped: shipped.includes(p.id) }));
  return {
    reports,
    problems,
    ok: problems.length === 0 && reports.every((r) => r.errors.length === 0),
  };
}

export function formatReport(report: LibraryReport, all = false): string {
  const lines: string[] = [];
  for (const p of report.problems) lines.push(`✗ ${p}`);
  for (const r of report.reports) {
    const status = r.errors.length ? "✗" : r.warnings.length ? "⚠" : "✓";
    lines.push(
      `${status} ${r.piece}${r.metrics ? ` (${r.metrics.width}×${r.metrics.height}, ${r.metrics.filled} cells)` : ""}`,
    );
    for (const f of r.findings) {
      if (f.ok && !all) continue;
      lines.push(`    ${f.ok ? "·" : f.severity === "error" ? "✗" : "⚠"} ${f.id}: ${f.measured}`);
    }
  }
  const errors = report.reports.reduce((n, r) => n + r.errors.length, 0) + report.problems.length;
  lines.push(
    report.reports.length === 0
      ? "no v2 art pieces yet (content/v2art)"
      : `${report.reports.length} piece(s), ${errors} error(s)`,
  );
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const report = checkLibrary(pieces, SHIPPED);
  console.log(formatReport(report, process.argv.includes("--all")));
  if (!report.ok) process.exit(1);
}
