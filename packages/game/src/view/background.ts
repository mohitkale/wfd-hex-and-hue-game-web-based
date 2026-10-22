import { EMPTY, type Level } from "@hexhue/core";

/**
 * The artwork's background color: the color on the most border cells (falling back to the most
 * common). A silhouette hides it so the subject's shape shows through.
 */
export function backgroundColor(
  level: Pick<Level, "width" | "height" | "cells">,
): number | undefined {
  const { width: w, height: h, cells } = level;
  const tally = (indices: number[]) => {
    const counts = new Map<number, number>();
    for (const i of indices) {
      const c = cells[i]!;
      if (c !== EMPTY) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  };
  const border: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border.push(i);
  }
  return tally(border) ?? tally(cells.map((_, i) => i));
}
