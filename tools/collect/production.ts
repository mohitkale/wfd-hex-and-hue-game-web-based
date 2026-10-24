/**
 * The production-level gate and report (M15.2, docs/V2_PRODUCTION.md): every level a player can
 * reach on the v2 board without a dev flag is validated, solved, played by the simulated players
 * and recorded in one committed report. A broken, trivial-for-its-role or inconsistent level fails
 * CI; a stale report fails CI; what only a human can judge is listed, never decided here.
 *
 *   npm run production:report   # rewrites docs/V2_PRODUCTION_REPORT.md
 *   npm run production:check    # exits 1 on a failure or when the committed report is out of date
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as collect from "@hexhue/core/collect";
import { TIERS, tiersSatisfied, type Tier } from "../../content/difficulty";
import { SHIPPED, pieces } from "../../content/v2art";
import { ART_LEVELS } from "../../packages/game/src/collect/artLevels";
import { moonlitHat } from "../../packages/game/src/collect/slice";
import { TUTORIAL } from "../../packages/game/src/collect/tutorialLevels";

export const REPORT = new URL("../../docs/V2_PRODUCTION_REPORT.md", import.meta.url);

export type Kind = "tutorial" | "slice" | "art";

/** The lowest tier of cheap-play resistance a kind of level must show (tutorials need none). */
export const REQUIRED_TIER: Record<Kind, Tier | null> = {
  tutorial: null,
  slice: "medium",
  art: "easy",
};

export interface Entry {
  kind: Kind;
  level: collect.CollectLevel;
}

/** Every level a player can reach in v2 without a dev flag: the tutorial, the slice, the art pieces (= the daily pool). */
export function inventory(): Entry[] {
  return [
    ...TUTORIAL.map((t): Entry => ({ kind: "tutorial", level: t.make() })),
    { kind: "slice", level: moonlitHat() },
    ...Object.values(ART_LEVELS).map((make): Entry => ({ kind: "art", level: make() })),
  ];
}

/**
 * Recorded deviations, by `"<level id>: <issue>"`, each with the reason and what removes it. An
 * issue that is not listed fails the gate; a listed one that no longer occurs fails it too (so the
 * debt can only shrink in the open).
 */
export const KNOWN: Record<string, string> = Object.fromEntries(
  [
    "art-crescent-moon",
    "art-triple-moon",
    "art-witchs-cauldron",
    "art-amethyst-cluster",
    "art-libra-scales",
  ].map((id) => [
    `${id}: trivial: only the tutorial tier fits (needs easy)`,
    "Single-layer picture: every cheap player wins (docs/V2_MEASURES.md). Needs a layered redesign before it counts as daily or world content.",
  ]),
);

export interface Row {
  id: string;
  name: string;
  kind: Kind;
  size: string;
  cubes: number;
  colours: number;
  groups: number;
  slots: number;
  minSlots: number | null;
  solved: boolean;
  lineLength: number;
  simpleWins: number;
  randomRate: number;
  tiers: Tier[];
  issues: string[];
  known: string[];
  /** What only a human can judge for this level. */
  human: string[];
}

const tierIndex = (t: Tier): number => TIERS.indexOf(t);

/** Validates, solves and plays one level, and lists what is wrong with it. */
export function check(entry: Entry): Row {
  const { level, kind } = entry;
  const issues: string[] = [];
  const errors = collect.validateCollectLevel(level);
  for (const e of errors) issues.push(`invalid: ${e}`);
  const cubes = level.cells.filter((c) => c !== -1).length;
  const row: Row = {
    id: level.id,
    name: level.name,
    kind,
    size: `${level.width}×${level.height}`,
    cubes,
    colours: level.palette.length,
    groups: level.columns.reduce((n, c) => n + c.length, 0),
    slots: level.slots,
    minSlots: null,
    solved: false,
    lineLength: 0,
    simpleWins: 0,
    randomRate: 0,
    tiers: [],
    issues,
    known: [],
    human: [],
  };
  if (errors.length > 0) return row;

  const solved = collect.solve(level);
  if (solved.status !== "solved" || !solved.line) {
    issues.push(`unsolvable: the solver says ${solved.status}`);
  } else {
    // The line must win when replayed in the live engine, not only in the solver's own search.
    const session = collect.replayLine(level, solved.line);
    if (session.state.status !== "won") issues.push("unsolvable: the solver's line does not win");
    else {
      row.solved = true;
      row.lineLength = solved.line.length;
      row.minSlots = collect.minSlots(level).slots;
    }
  }

  // Consistency: a level needs a picture and a way to be recognised when it is a picture level.
  if (kind === "art") {
    if (!level.subject) issues.push("inconsistent: an art level has no subject");
    if (!level.shades) issues.push("inconsistent: an art level has no shades");
    if (level.subject && level.id !== `art-${level.subject.id}`)
      issues.push("inconsistent: the level id does not follow its piece id");
  }
  if (level.width > 40 || level.height > 40) issues.push("inconsistent: board larger than 40×40");

  const report = collect.strategyReport(level);
  row.simpleWins = report.simpleWins;
  row.randomRate = report.randomRate;
  row.tiers = tiersSatisfied(report) as Tier[];
  const need = REQUIRED_TIER[kind];
  if (need !== null && row.solved) {
    const best = Math.max(-1, ...row.tiers.map(tierIndex));
    if (best < tierIndex(need)) {
      const fits = row.tiers.length === 0 ? "no tier fits" : `only the ${TIERS[best]} tier fits`;
      issues.push(`trivial: ${fits} (needs ${need})`);
    }
  }

  if (kind !== "tutorial") row.human.push("Playtest with first-time players (M15.4, gate G3).");
  const piece = pieces.find((p) => `art-${p.id}` === level.id);
  if (kind === "art" && !piece?.provenance.reviewed)
    row.human.push(
      "Art not reviewed by a human (`provenance.reviewed` is false in content/v2art).",
    );
  if (
    row.tiers.length > 0 &&
    row.tiers.every((t) => t === "tutorial" || t === "easy") &&
    kind === "art"
  )
    row.human.push(
      "Tutorial-grade difficulty: decide whether it belongs in the daily pool and worlds.",
    );
  return row;
}

export interface Result {
  rows: Row[];
  failures: string[];
}

/** Checks the whole inventory plus the cross-level rules, and applies the recorded deviations. */
export function checkAll(
  entries: readonly Entry[],
  known: Record<string, string> = KNOWN,
  shipped: readonly string[] = SHIPPED,
): Result {
  const rows = entries.map(check);
  const failures: string[] = [];
  const seen = new Set<string>();
  const cells = new Map<string, string>();
  for (const e of entries) {
    if (seen.has(e.level.id)) failures.push(`${e.level.id}: listed twice`);
    seen.add(e.level.id);
    // The same board with different groups or slots is a different puzzle (the tutorial reuses boards).
    const key = JSON.stringify([
      e.level.width,
      e.level.height,
      e.level.cells,
      e.level.columns,
      e.level.slots,
    ]);
    const twin = cells.get(key);
    if (twin) failures.push(`${e.level.id}: is the same puzzle as ${twin}`);
    cells.set(key, e.level.id);
  }
  const used = new Set<string>();
  for (const row of rows) {
    for (const issue of row.issues) {
      const key = `${row.id}: ${issue}`;
      // Only triviality can be a recorded deviation: broken and inconsistent levels never are.
      if (issue.startsWith("trivial:") && Object.hasOwn(known, key)) {
        used.add(key);
        row.known.push(issue);
      } else failures.push(key);
    }
    row.issues = row.issues.filter((i) => !row.known.includes(i));
  }
  for (const key of Object.keys(known)) {
    if (!used.has(key))
      failures.push(`stale known deviation (no longer occurs, remove it): ${key}`);
  }
  for (const id of shipped) {
    if (!seen.has(id)) failures.push(`${id}: shipped but not in the production inventory`);
  }
  if (rows.length === 0) failures.push("the production inventory is empty");
  return { rows, failures };
}

const pct = (n: number): string => `${Math.round(n * 100)} %`;

/** The committed report: deterministic (no dates, no timings), so CI can tell when it is stale. */
export function markdown(result: Result): string {
  const { rows, failures } = result;
  const lines: string[] = [
    "# v2 production level report (M15.2)",
    "",
    "Generated by `npm run production:report`; **do not edit by hand**. CI fails if it is out of date",
    "(`npm run production:check`). Method and policy: [V2_PRODUCTION.md](V2_PRODUCTION.md).",
    "",
    failures.length === 0
      ? `**Gate: PASS** (${rows.length} levels, ${rows.reduce((n, r) => n + r.known.length, 0)} recorded deviations).`
      : `**Gate: FAIL**: ${failures.map((f) => `\`${f}\``).join("; ")}`,
    "",
    "| Level | Kind | Board | Cubes | Colours | Groups | Slots (min) | Solved (moves) | Cheap players won | Random | Tiers fitted | Issues |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    lines.push(
      [
        `\`${r.id}\``,
        r.kind,
        r.size,
        r.cubes,
        r.colours,
        r.groups,
        `${r.slots} (${r.minSlots ?? "?"})`,
        r.solved ? `yes (${r.lineLength})` : "**no**",
        `${r.simpleWins}/9`,
        pct(r.randomRate),
        r.tiers.join(", ") || "none",
        [...r.issues.map((i) => `**${i}**`), ...r.known.map((k) => `known: ${k}`)].join("; ") ||
          "none",
      ]
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }
  lines.push("", "## Recorded deviations", "");
  const knownRows = rows.filter((r) => r.known.length > 0);
  if (knownRows.length === 0) lines.push("None.");
  for (const r of knownRows)
    for (const k of r.known) lines.push(`- \`${r.id}\` — ${k}: ${KNOWN[`${r.id}: ${k}`] ?? ""}`);
  lines.push("", "## What a human must still judge", "");
  for (const r of rows.filter((x) => x.human.length > 0)) {
    lines.push(`- \`${r.id}\``);
    for (const h of r.human) lines.push(`  - ${h}`);
  }
  lines.push(
    "",
    "Nothing here is human approval: solver results and simulated players say a level is winnable and",
    "not beaten by cheap play, never that it is fun or that its art is good.",
    "",
  );
  return lines.join("\n");
}

/** What the command does, apart from the process (so it is testable). */
export function run(
  args: readonly string[],
  entries: readonly Entry[] = inventory(),
  committed: () => string = () => readFileSync(REPORT, "utf8"),
  write: (text: string) => void = (text) => writeFileSync(REPORT, text),
): { code: number; out: string[] } {
  const result = checkAll(entries);
  const text = markdown(result);
  const out = result.failures.map((f) => `✗ ${f}`);
  out.push(`${result.rows.length} level(s), ${result.failures.length} failure(s)`);
  if (args.includes("--write")) {
    write(text);
    out.push(`→ ${fileURLToPath(REPORT)}`);
  }
  let code = result.failures.length > 0 ? 1 : 0;
  if (args.includes("--check")) {
    let current = "";
    try {
      current = committed();
    } catch {
      /* missing counts as stale */
    }
    if (current !== text) {
      out.push("✗ docs/V2_PRODUCTION_REPORT.md is out of date: run `npm run production:report`");
      code = 1;
    }
  }
  return { code, out };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = run(process.argv.slice(2));
  for (const line of result.out) console.log(line);
  if (result.code !== 0) process.exit(result.code);
}
