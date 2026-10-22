/**
 * Windowing for long scrolling lists (the world map): only items near the viewport exist as game
 * objects. Text objects are costly to create (one canvas each), so a 60-level map built in one go
 * stalls a phone for half a second; built lazily, opening the map costs one screen of nodes.
 */
export interface SyncPlan {
  /** Item indexes to create now, most urgent first. */
  create: number[];
  /** Item indexes to destroy (far outside the viewport). */
  destroy: number[];
}

/**
 * What to create and destroy for a viewport `[top, top + height)`. Items inside the viewport are
 * created at once (no pop-in); items within `margin` of it are created ahead of the scroll, at
 * most `budget` per call, closest first; items beyond `2 × margin` are destroyed.
 */
export function syncPlan(
  ys: readonly number[],
  live: ReadonlySet<number>,
  top: number,
  height: number,
  margin: number,
  budget: number,
): SyncPlan {
  const bottom = top + height;
  const distance = (y: number) => (y < top ? top - y : y > bottom ? y - bottom : 0);
  const visible: number[] = [];
  const ahead: number[] = [];
  const destroy: number[] = [];
  ys.forEach((y, i) => {
    const d = distance(y);
    if (live.has(i)) {
      if (d > 2 * margin) destroy.push(i);
    } else if (d === 0) visible.push(i);
    else if (d <= margin) ahead.push(i);
  });
  ahead.sort((a, b) => distance(ys[a]!) - distance(ys[b]!) || a - b);
  return { create: [...visible, ...ahead.slice(0, budget)], destroy };
}
