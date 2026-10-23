import { PANEL } from "./check";
import { contrast, distance, parseHex } from "./color";
import {
  NEUTRAL_FAMILIES,
  ROLES,
  deuteranopia,
  hueDistance,
  luminanceRatio,
  type Role,
} from "./families";
import { LICENCES, SOURCES, parsePiece, type ArtPiece, type Cell, type ParsedPiece } from "./piece";

/**
 * The machine-checkable rules of docs/ART_DIRECTION_V2.md (ids match the document; definitions are
 * §5a) plus the provenance rules of §6. `checkPiece` never throws on a bad picture: structural
 * errors become one `STRUCT` finding, and every rule reports what it measured.
 */

export type Severity = "error" | "warning";

export interface Finding {
  id: string;
  severity: Severity;
  ok: boolean;
  /** What was measured, for the report. */
  measured: string;
}

export interface Report {
  piece: string;
  findings: Finding[];
  /** Failed error-severity findings. */
  errors: Finding[];
  /** Failed warning-severity findings. */
  warnings: Finding[];
  metrics: Metrics | null;
}

/** The visual-density report (M11.4): what the picture is made of. */
export interface Metrics {
  width: number;
  height: number;
  filled: number;
  fillPercent: number;
  families: number;
  shades: number;
  edgeCells: number;
  meanRun: number;
  perFamily: Record<string, number>;
}

export interface CheckOptions {
  /** The piece is referenced by a world (M13+): it must be reviewed and licensed. */
  shipped?: boolean;
}

/** Thresholds, in one place so the document, the checks and the tests agree (document §3-§5a). */
export const LIMITS = {
  minSide: 16,
  maxSide: 40,
  minFilled: 120,
  maxFilled: 1000,
  minSpan: 0.85,
  minCornersEmpty: 3,
  minEmpty: 0.1,
  families: [3, 8],
  tutorialFamilies: [2, 8],
  tutorialSide: 24,
  shadesPerFamily: [1, 5],
  minBaseDistance: 90,
  minCrossShade: 50,
  step: [40, 180],
  maxHueDrift: 25,
  minPanelContrast: 1.6,
  maxGlint: 0.04,
  minIou: 0.75,
  minEdgeShadeShare: 0.35,
  maxEdgeDeepShare: 0.6,
  maxOrphans: 0.01,
  maxFlatRect: 0.08,
  maxTopShade: 0.45,
  maxDither: 0.02,
  minMeanRun: 2.0,
  maxBackdrop: 0.35,
  maxFragments: 0.04,
  confusableDeuteranopia: 30,
  confusableLuminance: 1.4,
  maxLore: 140,
} as const;

const N4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)} %`;

export function checkPiece(piece: ArtPiece, options: CheckOptions = {}): Report {
  const findings: Finding[] = [];
  const add = (id: string, ok: boolean, measured: string, severity: Severity = "error") =>
    findings.push({ id, severity, ok, measured });

  checkProvenance(piece, options, add);

  let parsed: ParsedPiece;
  try {
    parsed = parsePiece(piece);
  } catch (e) {
    add("STRUCT", false, (e as Error).message);
    return finish(piece, findings, null);
  }
  const metrics = checkPicture(piece, parsed, add);
  return finish(piece, findings, metrics);
}

function finish(piece: ArtPiece, findings: Finding[], metrics: Metrics | null): Report {
  return {
    piece: piece.id,
    findings,
    errors: findings.filter((f) => !f.ok && f.severity === "error"),
    warnings: findings.filter((f) => !f.ok && f.severity === "warning"),
    metrics,
  };
}

type Add = (id: string, ok: boolean, measured: string, severity?: Severity) => void;

/** Provenance rules (document §6): who drew it, under what licence, and whether a human reviewed it. */
function checkProvenance(piece: ArtPiece, options: CheckOptions, add: Add): void {
  const p = piece.provenance;
  add("PR-id", /^[a-z][a-z0-9-]*$/.test(piece.id), `id "${piece.id}"`);
  add(
    "PR-lore",
    piece.lore.trim().length > 0 &&
      piece.lore.length <= LIMITS.maxLore &&
      !/^todo/i.test(piece.lore.trim()),
    `lore ${piece.lore.length} characters`,
  );
  add("PR-author", p.author.trim().length > 0, p.author ? `author "${p.author}"` : "no author");
  add("PR-source", SOURCES.includes(p.source), `source "${p.source}"`);
  add("PR-licence", LICENCES.includes(p.licence), `licence "${p.licence}"`);
  add(
    "PR-licence-pending",
    !(options.shipped && p.licence === "original-owner-pending"),
    options.shipped
      ? "shipped with a licence the owner has not chosen (decide before release, G4)"
      : "not shipped",
    "warning",
  );
  // CI, solvers, simulated players and the model itself are never reviewers (CLAUDE.md gates).
  const reviewerOk =
    !p.reviewed ||
    (!!p.reviewedBy?.trim() &&
      !/\b(claude|anthropic|ai|bot|ci|solver|auto|simulat\w*)\b/i.test(p.reviewedBy) &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.reviewedOn ?? ""));
  add(
    "PR-reviewer",
    reviewerOk,
    p.reviewed ? `reviewed by "${p.reviewedBy ?? ""}" on ${p.reviewedOn ?? "?"}` : "not reviewed",
  );
  add(
    "PR-draft",
    !(p.source === "generated-draft" && (p.reviewed || options.shipped)),
    p.source === "generated-draft"
      ? "generated drafts are sketches: hand-finish the picture and change the source"
      : "not a generated draft",
  );
  add(
    "PR-reviewed",
    !options.shipped || p.reviewed,
    options.shipped ? (p.reviewed ? "reviewed" : "shipped but not reviewed") : "not shipped",
  );
}

function checkPicture(piece: ArtPiece, parsed: ParsedPiece, add: Add): Metrics {
  const { width: W, height: H, cells } = parsed;
  const at = (x: number, y: number): Cell | null =>
    x < 0 || y < 0 || x >= W || y >= H ? null : cells[y * W + x]!;
  const filled: [number, number, Cell][] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = at(x, y);
      if (c) filled.push([x, y, c]);
    }
  }
  const F = filled.length;
  const features = new Set(piece.features ?? "");

  // Size and silhouette (A-01..A-03).
  const sideOk = (n: number) => n >= LIMITS.minSide && n <= LIMITS.maxSide;
  add(
    "A-01",
    sideOk(W) && sideOk(H) && F >= LIMITS.minFilled && F <= LIMITS.maxFilled,
    `${W}×${H}, ${F} cells`,
  );
  const xs = filled.map((f) => f[0]);
  const ys = filled.map((f) => f[1]);
  const span = Math.max(
    (Math.max(...xs) - Math.min(...xs) + 1) / W,
    (Math.max(...ys) - Math.min(...ys) + 1) / H,
  );
  add("A-02", span >= LIMITS.minSpan, `bounding box spans ${pct(span, 0)}`);
  const corners = [
    [0, 0],
    [W - 1, 0],
    [0, H - 1],
    [W - 1, H - 1],
  ].filter(([x, y]) => !at(x!, y!)).length;
  const empty = 1 - F / (W * H);
  add(
    "A-03",
    corners >= LIMITS.minCornersEmpty && empty >= LIMITS.minEmpty,
    `${corners}/4 corners empty, ${pct(empty, 0)} empty`,
  );

  // Families, shades, palette (A-10..A-17).
  const roles = new Map<string, Set<Role>>();
  const perFamily: Record<string, number> = {};
  for (const [, , c] of filled) {
    if (!roles.has(c.family)) roles.set(c.family, new Set());
    roles.get(c.family)!.add(c.role);
    perFamily[c.family] = (perFamily[c.family] ?? 0) + 1;
  }
  const [minFam, maxFam] =
    Math.max(W, H) <= LIMITS.tutorialSide ? LIMITS.tutorialFamilies : LIMITS.families;
  add("A-10", roles.size >= minFam && roles.size <= maxFam, `${roles.size} families`);
  const [minShades, maxShades] = LIMITS.shadesPerFamily;
  add(
    "A-11",
    [...roles.values()].every((s) => s.size >= minShades && s.size <= maxShades),
    [...roles].map(([f, s]) => `${f} ${s.size}`).join(", "),
  );

  const used = [...roles].flatMap(([family, rs]) =>
    ROLES.filter((r) => rs.has(r)).map((role) => ({
      family,
      role,
      rgb: parseHex(parsed.ramps[family]![role]!),
    })),
  );
  const bases = [...roles.keys()].map((f) => ({ f, rgb: parseHex(parsed.ramps[f]!.base) }));
  let minBase = Infinity;
  for (let i = 0; i < bases.length; i++) {
    for (let j = i + 1; j < bases.length; j++)
      minBase = Math.min(minBase, distance(bases[i]!.rgb, bases[j]!.rgb));
  }
  add(
    "A-12",
    minBase >= LIMITS.minBaseDistance,
    bases.length < 2 ? "one family" : `closest bases ${Math.round(minBase)}`,
  );
  let cross = Infinity;
  let crossPair = "";
  for (const a of used) {
    for (const b of used) {
      if (a.family === b.family) continue;
      const d = distance(a.rgb, b.rgb);
      if (d < cross) {
        cross = d;
        crossPair = `${a.family} ${a.role} / ${b.family} ${b.role}`;
      }
    }
  }
  add(
    "A-13",
    cross >= LIMITS.minCrossShade,
    cross === Infinity
      ? "one family"
      : `closest cross-family shades ${Math.round(cross)} (${crossPair})`,
  );
  let minStep = Infinity;
  let maxStep = 0;
  for (const [family, rs] of roles) {
    const present = ROLES.filter((r) => rs.has(r));
    for (let i = 1; i < present.length; i++) {
      const d = distance(
        parseHex(parsed.ramps[family]![present[i]!]!),
        parseHex(parsed.ramps[family]![present[i - 1]!]!),
      );
      minStep = Math.min(minStep, d);
      maxStep = Math.max(maxStep, d);
    }
  }
  add(
    "A-14",
    minStep === Infinity || (minStep >= LIMITS.step[0] && maxStep <= LIMITS.step[1]),
    minStep === Infinity ? "no ramps" : `steps ${Math.round(minStep)}-${Math.round(maxStep)}`,
  );
  let drift = 0;
  for (const u of used) {
    if (NEUTRAL_FAMILIES.has(u.family)) continue;
    drift = Math.max(drift, hueDistance(u.rgb, parseHex(parsed.ramps[u.family]!.base)));
  }
  add("A-15", drift <= LIMITS.maxHueDrift, `max hue drift ${Math.round(drift)}°`);
  const lowest = Math.min(...used.map((u) => contrast(u.rgb, PANEL)));
  add("A-16", lowest >= LIMITS.minPanelContrast, `lowest contrast ${lowest.toFixed(2)}`);

  // A-17 (warning): base pairs that collapse under deuteranopia and cannot be told apart by value.
  const confusable: string[] = [];
  for (let i = 0; i < bases.length; i++) {
    for (let j = i + 1; j < bases.length; j++) {
      const a = bases[i]!;
      const b = bases[j]!;
      if (
        distance(deuteranopia(a.rgb), deuteranopia(b.rgb)) < LIMITS.confusableDeuteranopia &&
        luminanceRatio(a.rgb, b.rgb) < LIMITS.confusableLuminance
      )
        confusable.push(`${a.f}/${b.f}`);
    }
  }
  add(
    "A-17",
    confusable.length === 0,
    confusable.length ? `symbol-dependent pairs: ${confusable.join(", ")}` : "no pair collapses",
    "warning",
  );

  // Light, glints (A-18, A-19).
  const lightNotes: string[] = [];
  let lightOk = true;
  for (const [family, rs] of roles) {
    if (rs.size < 3) continue;
    const cen = (pick: (r: Role) => boolean) => {
      const pts = filled.filter(([, , c]) => c.family === family && pick(c.role));
      if (pts.length < 6) return null;
      return pts.reduce((s, [x, y]) => s + x + y, 0) / pts.length;
    };
    const lit = cen((r) => r === "light" || r === "glint");
    const dark = cen((r) => r === "shade" || r === "deep");
    if (lit === null || dark === null) continue;
    if (!(lit < dark)) lightOk = false;
    lightNotes.push(`${family} ${lit.toFixed(1)}/${dark.toFixed(1)}`);
  }
  add(
    "A-18",
    lightOk,
    lightNotes.length ? `light x+y / shade x+y: ${lightNotes.join(", ")}` : "n/a",
  );
  const glints = filled.filter(([, , c]) => c.role === "glint").length;
  add("A-19", glints / F <= LIMITS.maxGlint, `glint ${pct(glints / F)}`);

  // A-20 silhouette stability: mask IoU after a 2×2 round trip.
  let inter = 0;
  let union = 0;
  for (let by = 0; by < H; by += 2) {
    for (let bx = 0; bx < W; bx += 2) {
      const block = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const;
      const on = block.filter(([dx, dy]) => at(bx + dx, by + dy)).length >= 2;
      for (const [dx, dy] of block) {
        const x = bx + dx;
        const y = by + dy;
        if (x >= W || y >= H) continue;
        const original = !!at(x, y);
        if (original && on) inter++;
        if (original || on) union++;
      }
    }
  }
  add("A-20", inter / union >= LIMITS.minIou, `mask IoU ${(inter / union).toFixed(2)}`);

  // A-21 outline: edge cells (a 4-neighbour is empty or outside) should include shaded edges.
  const edge = filled.filter(([x, y]) => N4.some(([dx, dy]) => !at(x + dx, y + dy)));
  const edgeDeep = edge.filter(([, , c]) => c.role === "deep").length;
  const edgeShaded = edge.filter(([, , c]) => c.role === "deep" || c.role === "shade").length;
  add(
    "A-21",
    edgeShaded / edge.length >= LIMITS.minEdgeShadeShare &&
      edgeDeep / edge.length <= LIMITS.maxEdgeDeepShare,
    `${edge.length} edge cells: ${pct(edgeShaded / edge.length, 0)} deep/shade, ${pct(edgeDeep / edge.length, 0)} deep`,
  );

  // Noise (A-30..A-34).
  const sameFamily = (x: number, y: number, c: Cell) => {
    const n = at(x, y);
    return !!n && n.family === c.family;
  };
  const orphans = filled.filter(
    ([x, y, c]) => !features.has(c.ch) && !N4.some(([dx, dy]) => sameFamily(x + dx, y + dy, c)),
  ).length;
  add("A-30", orphans / F <= LIMITS.maxOrphans, `orphans ${pct(orphans / F)}`);

  let largest = 0;
  const heights = new Array<number>(W).fill(0);
  const chars = new Set(filled.map((f) => f[2].ch));
  for (const ch of chars) {
    heights.fill(0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) heights[x] = at(x, y)?.ch === ch ? heights[x]! + 1 : 0;
      for (let i = 0; i < W; i++) {
        let min = Infinity;
        for (let j = i; j < W; j++) {
          min = Math.min(min, heights[j]!);
          if (min === 0) break;
          largest = Math.max(largest, min * (j - i + 1));
        }
      }
    }
  }
  const byChar = new Map<string, number>();
  for (const [, , c] of filled) byChar.set(c.ch, (byChar.get(c.ch) ?? 0) + 1);
  const top = Math.max(...byChar.values()) / F;
  add(
    "A-31",
    largest / (W * H) <= LIMITS.maxFlatRect && top <= LIMITS.maxTopShade,
    `largest flat rectangle ${largest} cells = ${pct(largest / (W * H))}; top shade ${pct(top, 0)}`,
  );

  const dither = filled.filter(([x, y, c]) =>
    N4.every(([dx, dy]) => {
      const n = at(x + dx, y + dy);
      return !!n && n.family !== c.family;
    }),
  ).length;
  let runs = 0;
  let runCells = 0;
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = at(x, y);
      if (!c) {
        x++;
        continue;
      }
      let e = x;
      while (e + 1 < W && at(e + 1, y)?.ch === c.ch) e++;
      runs++;
      runCells += e - x + 1;
      x = e + 1;
    }
  }
  const meanRun = runCells / runs;
  add(
    "A-32",
    dither / F <= LIMITS.maxDither && meanRun >= LIMITS.minMeanRun,
    `dither ${pct(dither / F)}, mean run ${meanRun.toFixed(2)}`,
  );

  if (piece.backdrop?.length) {
    const back = filled.filter(([, , c]) => piece.backdrop!.includes(c.family));
    const shades = new Set(back.map(([, , c]) => c.role)).size;
    add(
      "A-33",
      back.length / F <= LIMITS.maxBackdrop && shades >= 2,
      `backdrop ${pct(back.length / F, 0)} of filled, ${shades} shades`,
    );
  } else add("A-33", true, "no backdrop");

  const seen = new Set<number>();
  let fragments = 0;
  for (const [x, y, c] of filled) {
    if (seen.has(y * W + x)) continue;
    const stack: [number, number][] = [[x, y]];
    const group: Cell[] = [];
    seen.add(y * W + x);
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      group.push(at(cx, cy)!);
      for (const [dx, dy] of N4) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!seen.has(ny * W + nx) && sameFamily(nx, ny, c) && nx >= 0 && ny >= 0) {
          seen.add(ny * W + nx);
          stack.push([nx, ny]);
        }
      }
    }
    if (group.length < 3) fragments += group.filter((g) => !features.has(g.ch)).length;
  }
  add("A-34", fragments / F <= LIMITS.maxFragments, `fragments ${pct(fragments / F)}`);

  return {
    width: W,
    height: H,
    filled: F,
    fillPercent: Math.round((F / (W * H)) * 100),
    families: roles.size,
    shades: used.length,
    edgeCells: edge.length,
    meanRun: +meanRun.toFixed(2),
    perFamily,
  };
}
