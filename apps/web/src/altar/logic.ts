import type {
  Action,
  AltarLayout,
  AltarState,
  AltarTool,
  GrimoireEntry,
  LessonRun,
  Walk,
} from "@hexhue/learn";

/**
 * The altar scene's decisions, as pure functions: what a tap or a gesture means, which tools a
 * ritual really used, and when fire safety must be shown. The scene (scene.ts) only draws and
 * listens.
 */

/** The flame standing on `spot`: a candle already there, or a candle tool placed on it. */
export function flameAt(altar: AltarLayout, state: AltarState, spot: string): string | null {
  const standing = (altar.candles ?? []).find((c) => c.spot === spot);
  if (standing) return standing.id;
  const placed = state.placed[spot];
  const tool = placed ? altar.tools.find((t) => t.id === placed) : undefined;
  return tool?.icon === "candle" ? tool.id : null;
}

/** A tap on a spot: places the selected tool, else lights or snuffs the flame there, else nothing. */
export function tapAction(
  altar: AltarLayout,
  state: AltarState,
  spot: string,
  selected: string | null,
): Action | null {
  if (selected) return { kind: "place", item: selected, spot };
  const flame = flameAt(altar, state, spot);
  if (!flame) return null;
  return state.lit.includes(flame)
    ? { kind: "snuff", item: flame }
    : { kind: "light", item: flame };
}

/**
 * A drawn gesture: a circle round the cloth is a walk; otherwise a straight stroke that started on
 * a spot is that spot's trace in that direction, if the altar has one.
 */
export function gestureAction(
  altar: AltarLayout,
  walk: Walk | null,
  start: string | null,
  direction: "up" | "down" | "left" | "right" | null,
): Action | null {
  if (walk) return { kind: "walk", path: walk };
  if (!start || !direction) return null;
  const trace = (altar.traces ?? []).find((t) => t.spot === start && t.direction === direction);
  return trace ? { kind: "trace", shape: trace.id } : null;
}

/** The tools a ritual really uses (placed, lit or snuffed), for its card: decoys left out. */
export function usedTools(entry: GrimoireEntry): AltarTool[] {
  const altar = entry.altar;
  if (!altar) return [];
  const used = new Set<string>();
  for (const s of entry.lesson.steps) {
    for (const a of s.expects) {
      if (a.kind === "place" || a.kind === "light" || a.kind === "snuff") used.add(a.item);
    }
  }
  const tools = altar.tools.filter((t) => used.has(t.id));
  const candles = (altar.candles ?? [])
    .filter((c) => used.has(c.id))
    .map((c): AltarTool => ({ id: c.id, label: "Candle", icon: "candle", color: c.color }));
  return [...tools, ...candles];
}

/** Fire safety comes first whenever a flame is still to be lit, on a fresh start or a resume. */
export function safetyFirst(entry: GrimoireEntry, run: LessonRun): boolean {
  if (!entry.safety.fire || run.finished) return false;
  return entry.lesson.steps.slice(run.step).some((s) => s.expects.some((a) => a.kind === "light"));
}
