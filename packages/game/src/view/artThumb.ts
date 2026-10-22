import Phaser from "phaser";
import { EMPTY, type Level } from "@hexhue/core";
import { backgroundColor } from "./background";

/**
 * A level's finished artwork as a small canvas texture (cached by level, cell size and mode),
 * drawn at a modest cell size and meant to be scaled up with nearest-neighbour filtering, which
 * keeps pixel art crisp and memory small. `silhouette` paints the subject in one muted color over
 * a near-invisible background: the shape is a teaser, the colors are the reward.
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
  const background = silhouette ? backgroundColor(level) : undefined;
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
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}
