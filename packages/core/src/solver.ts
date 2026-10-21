import { EMPTY, type Level } from "./level";
import { createRng } from "./rng";
import { cloneState, createState, launch, runQuiet, type LaunchSource, type SimState } from "./sim";

/**
 * Solvability is checked in the sequential model from GAME_DESIGN §1: one wisp at a time, each
 * finishing its lap before the next launch. The player can always wait, so a sequential solution
 * is a winning strategy for the real game.
 */

/**
 * `unsolvable` is a proof within the sequential model only; a level could still be winnable with
 * several wisps on the track at once. Shipping requires a sequential solution, so this errs safe.
 */
export type SolveStatus = "solved" | "unsolvable" | "unknown";

export interface SolveResult {
  status: SolveStatus;
  /** Launches that win when each is played to idle before the next. `null` unless solved. */
  solution: LaunchSource[] | null;
  /** Launches simulated (child states evaluated). */
  nodes: number;
}

export interface SolveOptions {
  /** Give up (status `unknown`) after expanding this many states. */
  maxNodes?: number;
}

/** Canonical key of an idle state: what remains in columns, slots and on the mosaic. */
function stateKey(s: SimState): string {
  let k = "";
  for (const col of s.columns) k += col.length + ",";
  const parked: number[] = [];
  // Charge ≤ 64² cells < 2^16, so id·2^16 + charge is unique.
  for (const w of s.slots) if (w) parked.push(w.id * 65536 + w.charge);
  parked.sort((a, b) => a - b);
  k += "|" + parked.join(",") + "|";
  // Cells only ever empty, and each cell's color is fixed, so occupancy bits identify the board.
  let bits = 0;
  let n = 0;
  for (const c of s.cells) {
    bits = (bits << 1) | (c === EMPTY ? 0 : 1);
    if (++n === 16) {
      k += String.fromCharCode(bits);
      bits = 0;
      n = 0;
    }
  }
  return k + String.fromCharCode(bits);
}

/** Every launch available from an idle state: column fronts first, then parked wisps. */
export function sequentialMoves(s: SimState): LaunchSource[] {
  const moves: LaunchSource[] = [];
  s.columns.forEach((col, index) => {
    if (col.length > 0) moves.push({ kind: "column", index });
  });
  s.slots.forEach((w, index) => {
    if (w) moves.push({ kind: "slot", index });
  });
  return moves;
}

/** Launches `source` and plays the track to idle. Returns the resulting state (a copy). */
export function playSequential(s: SimState, source: LaunchSource): SimState {
  const next = cloneState(s);
  launch(next, source);
  runQuiet(next);
  return next;
}

/**
 * Depth-first search over sequential launches with memoization. Children are tried in order of
 * fragments collected (most first), so typical levels are solved almost greedily.
 */
export function solveState(start: SimState, options: SolveOptions = {}): SolveResult {
  const maxNodes = options.maxNodes ?? 200_000;
  const root = cloneState(start);
  runQuiet(root);
  if (root.status === "won") return { status: "solved", solution: [], nodes: 0 };
  if (root.status === "lost") return { status: "unsolvable", solution: null, nodes: 0 };

  const seen = new Set<string>([stateKey(root)]);
  const path: LaunchSource[] = [];
  let nodes = 0;
  let exhausted = false;

  const search = (s: SimState): boolean => {
    const children: { move: LaunchSource; state: SimState; gained: number }[] = [];
    for (const move of sequentialMoves(s)) {
      if (nodes >= maxNodes) {
        exhausted = true;
        return false;
      }
      nodes++;
      const next = playSequential(s, move);
      if (next.status === "won") {
        path.push(move);
        return true;
      }
      if (next.status === "lost") continue;
      const key = stateKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      children.push({ move, state: next, gained: s.remaining - next.remaining });
    }
    children.sort((a, b) => b.gained - a.gained);
    for (const child of children) {
      path.push(child.move);
      if (search(child.state)) return true;
      path.pop();
      if (exhausted) return false;
    }
    return false;
  };

  const solved = search(root);
  if (solved) return { status: "solved", solution: path, nodes };
  return { status: exhausted ? "unknown" : "unsolvable", solution: null, nodes };
}

/** State for `level`, optionally with a different number of holding slots. */
export function stateWithSlots(level: Level, slots = level.slots): SimState {
  return createState({ ...level, slots });
}

export function solve(level: Level, options: SolveOptions = {}): SolveResult {
  return solveState(stateWithSlots(level), options);
}

/** Plays `solution` sequentially from the level start; true if it wins. */
export function verifySolution(level: Level, solution: readonly LaunchSource[]): boolean {
  let s = stateWithSlots(level);
  for (const move of solution) {
    if (s.status !== "playing") return false;
    if (move.kind === "column" ? !s.columns[move.index]?.length : !s.slots[move.index])
      return false;
    s = playSequential(s, move);
  }
  return s.status === "won";
}

export interface DifficultyReport {
  solve: SolveResult;
  /**
   * Fewest holding slots that still allow a sequential win (1..level.slots), or `null` if
   * unsolved. A budget-limited (`unknown`) check counts as not enough, so this may overestimate.
   */
  minSlots: number | null;
  /** Share of sensible-novice sequential play-throughs that lose (0..1). */
  lossRate: number;
  /** Heuristic 0 (trivial) .. 1 (brutal); tuned in M4. */
  difficulty: number;
  /** Total wisps in the level. */
  wisps: number;
}

export interface AnalyzeOptions extends SolveOptions {
  /** Random play-throughs used for `lossRate`. */
  playouts?: number;
  seed?: number;
}

/**
 * A "sensible novice" sequential player: picks at random among launches that collect at least one
 * fragment, and only launches a wisp that collects nothing when no other launch does. It never
 * plans ahead, so it falls into the traps a level sets (burying needed wisps, filling slots).
 * Making far more launches than there are wisps counts as a loss (stuck cycling parked wisps).
 */
function noviceWins(level: Level, seed: number): boolean {
  const rng = createRng(seed);
  let s = stateWithSlots(level);
  const wisps = level.columns.reduce((n, c) => n + c.length, 0);
  for (let i = 0; i < wisps * 4 && s.status === "playing"; i++) {
    const outcomes = sequentialMoves(s).map((move) => playSequential(s, move));
    const useful = outcomes.filter((o) => o.remaining < s.remaining);
    const pool = useful.length > 0 ? useful : outcomes;
    s = pool[rng.int(0, pool.length - 1)]!;
  }
  return s.status === "won";
}

export function analyzeLevel(level: Level, options: AnalyzeOptions = {}): DifficultyReport {
  const playouts = options.playouts ?? 100;
  const seed = options.seed ?? 1;
  const wisps = level.columns.reduce((n, c) => n + c.length, 0);
  const result = solve(level, options);

  let minSlots: number | null = null;
  if (result.status === "solved") {
    for (let k = 1; k <= level.slots; k++) {
      if (k === level.slots || solveState(stateWithSlots(level, k), options).status === "solved") {
        minSlots = k;
        break;
      }
    }
  }

  let losses = 0;
  for (let i = 0; i < playouts; i++) if (!noviceWins(level, seed + i * 7919)) losses++;
  const lossRate = playouts > 0 ? losses / playouts : 0;
  const tightness = minSlots === null ? 1 : minSlots / level.slots;
  const difficulty = Math.round((0.7 * lossRate + 0.3 * tightness) * 1000) / 1000;

  return { solve: result, minSlots, lossRate, difficulty, wisps };
}
