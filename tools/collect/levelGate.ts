/**
 * The level quality gate and report (M12.6, docs/V2_LEVEL_GATE.md): for every level in a pool it
 * measures the level, runs the solver, the simulated players, the tier band and the difficulty
 * curve, and lists what is wrong. The gate fails on a level the solver cannot win, on a level that
 * cheap play beats where its tier forbids it, and on a level outside its tier band or the curve,
 * unless that exact deviation is a recorded, reasoned waiver in `content/poolV2.ts`; and on a
 * waiver that no longer applies, so recorded debt cannot go stale.
 */
import * as collect from "@hexhue/core/collect";
import { checkEntry, stageForLevel, type CurveEntry } from "../../content/curveV2";
import {
  checkLevel,
  checkStrategies,
  checkWorld,
  type LevelMetrics,
  type Tier,
} from "../../content/difficulty";
import type { PoolLevel } from "../../content/poolV2";
import { cellColor } from "../../packages/game/src/collect/pictureView";

export type IssueKind = "unsolvable" | "trivial" | "band" | "curve" | "world" | "waiver";

export interface Issue {
  kind: IssueKind;
  message: string;
  /** Recorded as a known deviation in the pool (only band, curve and world issues can be). */
  waived: boolean;
}

export interface LevelReport {
  id: string;
  name: string;
  number: number;
  tier: Tier;
  stage: string;
  cubes: number;
  colors: number;
  groups: number;
  slots: number;
  width: number;
  height: number;
  solved: boolean;
  /** The solver's winning line, replayed to a win in the engine, as text (empty if unsolved). */
  line: string[];
  measures: collect.Measures | null;
  score: collect.DifficultyScore | null;
  issues: Issue[];
  /** The level, kept for the picture in the HTML report. */
  level: collect.CollectLevel;
}

/** What one report line of an action says. */
const describe = (a: collect.Action): string =>
  a.kind === "select" ? `column ${a.column + 1}` : `resume slot ${a.slot + 1}`;

export function reportLevel(entry: PoolLevel, level: collect.CollectLevel): LevelReport {
  const stage = stageForLevel(entry.level);
  const tier = stage.tier;
  const base = {
    id: entry.id,
    name: level.name,
    number: entry.level,
    tier,
    stage: stage.id,
    cubes: level.cells.filter((c) => c >= 0).length,
    colors: new Set(level.cells.filter((c) => c >= 0)).size,
    groups: level.columns.reduce((n, c) => n + c.length, 0),
    slots: level.slots,
    width: level.width,
    height: level.height,
    level,
  };
  const solved = collect.solve(level);
  if (solved.status !== "solved") {
    return {
      ...base,
      solved: false,
      line: [],
      measures: null,
      score: null,
      issues: [
        {
          kind: "unsolvable",
          message:
            solved.status === "unsolvable"
              ? "the solver proves the level cannot be won"
              : "the solver could not decide the level within its budget",
          waived: false,
        },
      ],
    };
  }
  // A solution only counts if the live engine replays it to a win.
  const replay = collect.replayLine(level, solved.line!);
  const line = solved.line!.map(describe);
  const measures = collect.measureLevel(level)!;
  const score = collect.difficultyScore(measures);
  const known = new Set(entry.knownIssues.map((k) => k.message));
  const issues: Issue[] = [];
  if (replay.state.status !== "won") {
    issues.push({
      kind: "unsolvable",
      message: "the solver's line does not win when replayed",
      waived: false,
    });
  }
  const strategies = { wins: measures.wins, randomRate: measures.randomRate };
  const trivial = checkStrategies(strategies, tier);
  for (const m of trivial) issues.push({ kind: "trivial", message: m, waived: false });
  const metrics: LevelMetrics = measures;
  const tutorialNumber = tier === "tutorial" ? entry.level : undefined;
  for (const m of checkLevel(metrics, tier, tutorialNumber)) {
    if (trivial.includes(m)) continue;
    issues.push({ kind: "band", message: m, waived: known.has(m) });
  }
  const curveEntry: CurveEntry = {
    level: entry.level,
    id: entry.id,
    cubes: base.cubes,
    measures: {
      score: score.total,
      deadEndShare: measures.deadEndShare,
      temptingPoorShare: measures.temptingPoorShare,
      doomedFirstShare: measures.doomedFirstShare,
      planningDepth: measures.planningDepth,
      hiddenColors: measures.hiddenColors,
      slotPressure: measures.slotPressure,
      seconds: measures.seconds,
    },
    strategies,
    reachableLoss: measures.reachableLoss,
  };
  for (const m of checkEntry(curveEntry)) {
    // The cheap-player and loss rows repeat tier checks above: report each deviation once.
    if (trivial.some((t) => m.endsWith(t))) continue;
    issues.push({ kind: "curve", message: m, waived: known.has(m) });
  }
  // Waivers must still be needed.
  const present = new Set(issues.map((i) => i.message));
  for (const k of entry.knownIssues) {
    if (!present.has(k.message)) {
      issues.push({
        kind: "waiver",
        message: `the recorded deviation no longer occurs: ${k.message}`,
        waived: false,
      });
    }
  }
  return { ...base, solved: true, line, measures, score, issues };
}

export interface PoolReport {
  levels: LevelReport[];
  /** World-level repetition issues across the pool. */
  world: Issue[];
  /** Messages of everything that fails the gate (empty = pass). */
  failures: string[];
}

/** Reports every level of a pool and applies the gate. `load` turns a pool entry into its level. */
export function reportPool(
  pool: readonly PoolLevel[],
  load: (id: string) => collect.CollectLevel,
  knownWorld: readonly string[] = [],
): PoolReport {
  const levels = pool.map((entry) => reportLevel(entry, load(entry.id)));
  const ids = pool.map((p) => p.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  const numbers = pool.map((p) => p.level);
  const failures: string[] = [];
  for (const id of new Set(dup)) failures.push(`pool: level id ${id} is listed twice`);
  numbers.forEach((n, i) => {
    if (numbers.indexOf(n) !== i) failures.push(`pool: level number ${n} is used twice`);
  });
  const world: Issue[] = checkWorld(
    levels
      .filter((l) => l.measures)
      .map((l) => ({ tier: l.tier, metrics: { wins: l.measures!.wins } })),
  ).map((message) => ({ kind: "world" as const, message, waived: knownWorld.includes(message) }));
  for (const w of knownWorld) {
    if (!world.some((i) => i.message === w))
      world.push({
        kind: "waiver",
        message: `the recorded world deviation no longer occurs: ${w}`,
        waived: false,
      });
  }
  for (const l of levels) {
    for (const i of l.issues)
      if (!i.waived)
        failures.push(`${l.id} (level ${l.number}, ${l.tier}): ${i.kind}: ${i.message}`);
  }
  for (const i of world) if (!i.waived) failures.push(`world: ${i.message}`);
  return { levels, world, failures };
}

// ---------------------------------------------------------------------------------------------
// The HTML report
// ---------------------------------------------------------------------------------------------

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const f = (x: number): string => (Number.isFinite(x) ? String(Math.round(x * 100) / 100) : "∞");

/** The level's picture as inline SVG (its shades when it has them). */
function picture(level: collect.CollectLevel): string {
  const cell = Math.max(2, Math.floor(180 / Math.max(level.width, level.height)));
  const rects = level.cells
    .map((_, i) => {
      const c = cellColor(level, i);
      return c === null
        ? ""
        : `<rect x="${(i % level.width) * cell}" y="${Math.floor(i / level.width) * cell}" width="${cell - (cell > 4 ? 1 : 0)}" height="${cell - (cell > 4 ? 1 : 0)}" fill="#${c.toString(16).padStart(6, "0")}"/>`;
    })
    .join("");
  return `<svg width="${level.width * cell}" height="${level.height * cell}" shape-rendering="crispEdges">${rects}</svg>`;
}

export function reportHtml(pool: PoolReport): string {
  const status = pool.failures.length === 0 ? "pass" : "fail";
  const cards = pool.levels
    .map((l) => {
      const m = l.measures;
      const bad = l.issues.filter((i) => !i.waived);
      const players = m
        ? collect.DETERMINISTIC_PLAYERS.map(
            (p) =>
              `<span class="${m.wins[p] ? "win" : "lose"}">${esc(p)} ${m.wins[p] ? "win" : "lose"}</span>`,
          ).join(" ")
        : "";
      const components = l.score
        ? l.score.components
            .map(
              (c) =>
                `<tr><td>${esc(c.label)}</td><td>${esc(String(c.measure))}</td><td>${f(c.raw)}</td><td>${f(c.points)} / ${Math.round(c.weight * 100)}${c.excluded ? ` (${esc(c.excluded)})` : ""}</td></tr>`,
            )
            .join("")
        : "";
      const issues = l.issues
        .map(
          (i) =>
            `<li class="${i.waived ? "waived" : "issue"}"><b>${esc(i.kind)}</b>${i.waived ? " (known deviation)" : ""}: ${esc(i.message)}</li>`,
        )
        .join("");
      return `<section class="${bad.length ? "fail" : "ok"}">
<h2>${esc(l.name)} <small>${esc(l.id)} · level ${l.number} · ${esc(l.tier)} (${esc(l.stage)})</small></h2>
<div class="row"><div class="pic">${picture(l.level)}</div><div>
<p>${l.width}×${l.height} · ${l.cubes} cubes · ${l.colors} colours · ${l.groups} groups · ${l.slots} slots · ${l.solved ? `winning line of ${l.line.length} moves` : "<b>not solved</b>"}${m ? ` · about ${f(m.seconds / 60)} min (settled-sequential upper bound)` : ""}</p>
${m ? `<p>score <b>${f(l.score!.total)}</b> · dead ends ${f(m.deadEndShare)} · first-move risk ${f(m.doomedFirstShare)} · planning depth ${f(m.planningDepth)} · random wins ${Math.round(m.randomRate * 100)} %</p><p class="players">${players}</p>` : ""}
${l.line.length ? `<details><summary>Winning line</summary><ol>${l.line.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>` : ""}
${components ? `<details><summary>Score components</summary><table>${components}</table></details>` : ""}
<ul class="issues">${issues || '<li class="clean">no issues</li>'}</ul>
</div></div></section>`;
    })
    .join("\n");
  const world = pool.world
    .map(
      (i) =>
        `<li class="${i.waived ? "waived" : "issue"}"><b>${esc(i.kind)}</b>: ${esc(i.message)}</li>`,
    )
    .join("");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hex & Hue level report</title>
<style>
body{background:#140b2e;color:#f5efff;font:14px system-ui;margin:24px;max-width:960px}
section{background:#0f0824;border-radius:12px;padding:16px;margin:0 0 20px;border-left:6px solid #5cbf5a}
section.fail{border-left-color:#ff8fa3}.row{display:flex;gap:20px;flex-wrap:wrap}
small,.players span{color:#b9a9e6}.win{color:#95d594!important}.lose{color:#ff8fa3!important}
.issue{color:#ff8fa3}.waived{color:#f6d97a}.clean{color:#95d594}ul.issues{padding-left:18px}
.banner{padding:12px 16px;border-radius:8px;margin:0 0 20px}.banner.pass{background:#1f4a2b}.banner.fail{background:#5a1f2f}
table{border-collapse:collapse}td{padding:2px 10px 2px 0;font-size:12px}
</style><h1>Hex &amp; Hue level report</h1>
<div class="banner ${status}"><b>Gate: ${status.toUpperCase()}</b>${pool.failures.length ? `<ul>${pool.failures.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : " (every deviation is a recorded known deviation)"}</div>
${world ? `<h2>World</h2><ul class="issues">${world}</ul>` : ""}
${cards}`;
}
