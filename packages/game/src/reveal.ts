import { EMPTY } from "@hexhue/core";

/**
 * Order in which the finished artwork blooms back in on a win: filled cells sorted by distance
 * from the mosaic's center (ties broken by index, so the order is stable).
 */
export function revealOrder(width: number, height: number, cells: readonly number[]): number[] {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const dist = (i: number) => {
    const x = i % width;
    const y = Math.floor(i / width);
    return (x - cx) ** 2 + (y - cy) ** 2;
  };
  return cells
    .map((c, i) => (c === EMPTY ? -1 : i))
    .filter((i) => i !== -1)
    .sort((a, b) => dist(a) - dist(b) || a - b);
}

/** How many of `total` cells should be shown `elapsed` ms into a reveal lasting `duration` ms. */
export function revealedCount(total: number, elapsed: number, duration: number): number {
  const t = Math.min(1, Math.max(0, elapsed / duration));
  // Ease-in-out so the bloom starts gently and finishes with a flourish.
  const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  return Math.round(total * e);
}
