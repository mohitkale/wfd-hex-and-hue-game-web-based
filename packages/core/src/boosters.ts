import { EMPTY } from "./level";
import { collectAt, trackFor, type SimEvent, type SimState } from "./sim";
import { firstInSight } from "./track";

/** Mosaic cells of `color` that some lane can see right now (the ones a wisp could collect). */
export function exposedCells(s: SimState, color: number): number[] {
  const found = new Set<number>();
  for (const cell of trackFor(s.width, s.height)) {
    if (!cell.sight) continue;
    const i = firstInSight(s.cells, cell.sight);
    if (i !== -1 && s.cells[i] === color) found.add(i);
  }
  return [...found].sort((a, b) => a - b);
}

/** Colors that currently have at least one exposed fragment. */
export function wandColors(s: SimState): number[] {
  const colors = new Set<number>();
  for (const cell of trackFor(s.width, s.height)) {
    if (!cell.sight) continue;
    const i = firstInSight(s.cells, cell.sight);
    if (i !== -1) colors.add(s.cells[i]!);
  }
  return [...colors].sort((a, b) => a - b);
}

export interface WandResult {
  cells: number[];
  /** Wisps whose charge reached 0 and left play. */
  spent: number[];
}

/**
 * Magic Wand: collects every exposed fragment of `color` at once. The same number of charge is
 * taken from that color's wisps — those waiting longest in line first (back of the columns), then
 * parked ones, then any on the track — so charges always equal fragments and the level stays
 * winnable. Wisps reaching 0 leave play.
 */
export function applyWand(s: SimState, color: number): WandResult {
  const cells = s.status === "playing" ? exposedCells(s, color) : [];
  const spent: number[] = [];
  if (cells.length === 0) return { cells, spent };
  for (const c of cells) s.cells[c] = EMPTY;
  s.remaining -= cells.length;
  let owed = cells.length;
  const take = (w: { id: number; color: number; charge: number }) => {
    if (owed === 0 || w.color !== color) return false;
    const n = Math.min(w.charge, owed);
    w.charge -= n;
    owed -= n;
    if (w.charge === 0) spent.push(w.id);
    return w.charge === 0;
  };
  for (const col of s.columns) {
    for (let k = col.length - 1; k >= 0; k--) if (take(col[k]!)) col.splice(k, 1);
  }
  s.slots.forEach((w, i) => {
    if (w && take(w)) s.slots[i] = null;
  });
  s.track = s.track.filter((w) => !take(w));
  if (s.remaining === 0) s.status = "won";
  return { cells, spent };
}

/**
 * Extra Slot: adds a holding slot. On a lost level (a wisp finished its lap with every slot full)
 * it also revives: that wisp parks in the new slot, and the step the loss interrupted is finished
 * for the wisps behind it (they had moved but not yet collected; the loser is always the
 * front-most wisp, so all of them). Returns the revived wisp id, or `null` if nothing needed
 * reviving. Events from the finished step are appended to `events`.
 */
export function addSlot(s: SimState, events: SimEvent[] | null = null): number | null {
  if (s.status === "won") return null;
  s.slots.push(null);
  if (s.status !== "lost") return null;
  const track = trackFor(s.width, s.height);
  const loser = s.track.find((w) => w.traveled >= track.length);
  if (!loser) return null;
  s.slots[s.slots.length - 1] = { id: loser.id, color: loser.color, charge: loser.charge };
  events?.push({ type: "parked", wispId: loser.id, slot: s.slots.length - 1 });
  s.status = "playing";
  s.track = s.track.filter((w) => w !== loser && collectAt(s, w, track, events));
  if (s.remaining === 0) {
    s.status = "won";
    events?.push({ type: "won" });
  }
  return loser.id;
}
