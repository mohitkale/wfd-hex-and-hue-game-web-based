import type * as collect from "@hexhue/core/collect";
import type Phaser from "phaser";
import { theme } from "../theme";
import type { CollectLayout } from "./collectLayout";
import { tonesFor } from "./cubePaint";

/**
 * The Crystal Lantern's view (M15.13): every box still waiting in every column, front at the top, as
 * small coloured chips with their numbers, so the player can plan beyond the three rows the board
 * shows. Play waits while it is open; a tap anywhere closes it. Returns the objects it added.
 */
export function buildLanternPanel(
  scene: Phaser.Scene,
  l: CollectLayout,
  state: Readonly<collect.CollectState>,
  palette: readonly string[],
  onClose: () => void,
): Phaser.GameObjects.GameObject[] {
  const dpr = l.dpr;
  const parts: Phaser.GameObjects.GameObject[] = [];
  const cx = l.frame.x + l.frame.w / 2;
  const shade = scene.add
    .rectangle(cx, l.frame.y + l.frame.h / 2, l.frame.w, l.frame.h, 0x140b2e, 0.88)
    .setDepth(60)
    .setInteractive();
  shade.on("pointerdown", onClose);
  parts.push(shade);
  const title = scene.add
    .text(cx, l.frame.y + 48 * dpr, "🏮 Crystal Lantern", {
      fontFamily: theme.font,
      fontStyle: "bold",
      fontSize: `${Math.round(20 * dpr)}px`,
      color: "#f6d97a",
    })
    .setOrigin(0.5)
    .setDepth(61);
  const note = scene.add
    .text(cx, l.frame.y + 76 * dpr, "Every box still to come, front first. Tap to close", {
      fontFamily: theme.font,
      fontSize: `${Math.round(13 * dpr)}px`,
      color: theme.textDim,
    })
    .setOrigin(0.5)
    .setDepth(61);
  parts.push(title, note);

  const columns = state.columns;
  const n = Math.max(1, columns.length);
  const deepest = Math.max(1, ...columns.map((c) => c.length));
  const top = l.frame.y + 104 * dpr;
  const room = l.frame.y + l.frame.h - top - 24 * dpr;
  const gap = 6 * dpr;
  const chip = Math.floor(
    Math.min(
      l.tile,
      (l.frame.w * 0.86 - (n - 1) * 3 * gap) / n,
      (room - (deepest - 1) * gap) / deepest,
    ),
  );
  const totalW = n * chip + (n - 1) * 3 * gap;
  const x0 = cx - totalW / 2 + chip / 2;
  columns.forEach((column, c) => {
    const x = x0 + c * (chip + 3 * gap);
    column.forEach((id, depth) => {
      const g = state.groups[id]!;
      const y = top + chip / 2 + depth * (chip + gap);
      const tones = tonesFor(palette[g.color]!);
      const box = scene.add
        .rectangle(x, y, chip, chip, tones.base)
        .setStrokeStyle(Math.max(1, dpr * 1.5), depth === 0 ? 0xffffff : tones.dark)
        .setDepth(61);
      const label = scene.add
        .text(x, y, String(g.capacity - g.delivered), {
          fontFamily: theme.font,
          fontStyle: "bold",
          fontSize: `${Math.max(8, Math.round(chip * 0.42))}px`,
          color: "#ffffff",
          stroke: `#${tones.dark.toString(16).padStart(6, "0")}`,
          strokeThickness: Math.max(2, Math.round(dpr * 2)),
        })
        .setOrigin(0.5)
        .setDepth(62);
      parts.push(box, label);
    });
  });
  return parts;
}
