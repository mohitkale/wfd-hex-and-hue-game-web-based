/**
 * One row of trays for every group that is out of its column (v2.0.0 look). A tray holds a box whether
 * it is working (the tray is open and the familiars come out of it) or pending (it has nothing it can
 * reach and waits, dimmed). The engine keeps two limits, how many groups may work at once (`fieldCap`)
 * and how many may wait (`slots`); a box that stalls keeps its tray, so the trays shown are exactly
 * `fieldCap + slots` and there is always one free for a group that starts or resumes. Pure.
 */

/**
 * How many trays a level shows: the working limit plus the waiting limit (the Extra Slot booster adds
 * one), or, with shared trays (M15.13), the trays themselves, where every box works.
 */
export const trayCount = (fieldCap: number, slots: number, shared = false): number =>
  shared ? slots : fieldCap + slots;

interface Occupant {
  id: number;
  status: string;
}

/**
 * Which tray each working or waiting group sits in. A group keeps the tray it had (`previous`) while it
 * is working or waiting; a group that has just left its column takes the lowest free tray. Groups in a
 * column or completed have none. If there are more occupants than trays (never in a valid game) the
 * extras are left out rather than sharing a tray.
 */
export function assignTrays(
  previous: ReadonlyMap<number, number>,
  groups: readonly Occupant[],
  total: number,
): Map<number, number> {
  const out = new Map<number, number>();
  const used = new Set<number>();
  const active = groups.filter((g) => g.status === "working" || g.status === "waiting");
  for (const g of active) {
    const had = previous.get(g.id);
    if (had !== undefined && had >= 0 && had < total && !used.has(had)) {
      out.set(g.id, had);
      used.add(had);
    }
  }
  for (const g of active) {
    if (out.has(g.id)) continue;
    let t = 0;
    while (t < total && used.has(t)) t++;
    if (t >= total) continue;
    out.set(g.id, t);
    used.add(t);
  }
  return out;
}
