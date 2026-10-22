import type Phaser from "phaser";
import { EMPTY, type Level } from "@hexhue/core";

/**
 * A level's finished artwork as a small canvas texture (cached by level, cell size and mode).
 * `silhouette` paints the subject in one muted color over a near-invisible background: the shape is
 * a teaser, the colors are the reward for clearing it.
 */
export function artTexture(
  scene: Phaser.Scene,
  level: Level,
  cell: number,
  silhouette = false,
): string {
  const key = `art-${level.id}-${cell}-${silhouette ? "s" : "c"}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, level.width * cell, level.height * cell)!;
  const ctx = tex.getContext();
  const gap = cell >= 4 ? Math.max(1, Math.round(cell * 0.1)) : 0;
  // In a silhouette the most common color (usually the background) is nearly invisible, so the
  // subject's shape shows through as a teaser.
  const counts = new Map<number, number>();
  for (const c of level.cells) if (c !== EMPTY) counts.set(c, (counts.get(c) ?? 0) + 1);
  const background = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  level.cells.forEach((c, i) => {
    if (c === EMPTY) return;
    ctx.fillStyle = silhouette ? (c === background ? "#231a45" : "#4a3a86") : level.palette[c]!;
    ctx.fillRect(
      (i % level.width) * cell,
      Math.floor(i / level.width) * cell,
      cell - gap,
      cell - gap,
    );
  });
  tex.refresh();
  return key;
}
