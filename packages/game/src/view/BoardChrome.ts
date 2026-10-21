import Phaser from "phaser";
import { trackFor } from "@hexhue/core";
import { cellCenter, type Layout } from "../layout";
import { theme } from "../theme";

/**
 * Static board decoration: panel, track ring with direction chevrons and entry gate, portal and
 * holding-slot frames. Rebuilt on resize.
 */
export function drawBoardChrome(
  scene: Phaser.Scene,
  layout: Layout,
  width: number,
  height: number,
  slotCount: number,
): Phaser.GameObjects.GameObject[] {
  const { cell, boardRect, dpr } = layout;
  const objects: Phaser.GameObjects.GameObject[] = [];
  const g = scene.add.graphics();
  objects.push(g);

  // Panel behind the mosaic and track.
  g.fillStyle(theme.panel, 0.9);
  g.fillRoundedRect(boardRect.x, boardRect.y, boardRect.w, boardRect.h, cell * 0.6);

  // Track: a rounded loop through the track-cell centers.
  const half = cell / 2;
  const loop = {
    x: boardRect.x + half,
    y: boardRect.y + half,
    w: boardRect.w - cell,
    h: boardRect.h - cell,
  };
  g.lineStyle(cell * 0.62, theme.track, 0.14);
  g.strokeRoundedRect(loop.x, loop.y, loop.w, loop.h, half);
  g.lineStyle(Math.max(1, dpr), theme.track, 0.5);
  g.strokeRoundedRect(loop.x, loop.y, loop.w, loop.h, half);

  // Direction chevrons every few lane cells.
  const track = trackFor(width, height);
  const every = Math.max(2, Math.round(Math.max(width, height) / 5));
  g.fillStyle(theme.mist, 0.35);
  track.forEach((t, i) => {
    if (t.lane === "corner" || i % every !== 0) return;
    const next = track[(i + 1) % track.length]!;
    const a = cellCenter(layout, t.x, t.y);
    const angle = Math.atan2(next.y - t.y, next.x - t.x);
    const s = cell * 0.16;
    const p = (dx: number, dy: number) => ({
      x: a.x + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: a.y + dx * Math.sin(angle) + dy * Math.cos(angle),
    });
    const [p1, p2, p3] = [p(s, 0), p(-s, -s), p(-s, s)];
    g.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
  });

  // Entry gate at the bottom-left corner.
  const entry = cellCenter(layout, -1, height);
  g.fillStyle(theme.glow, 0.25);
  g.fillCircle(entry.x, entry.y, cell * 0.42);
  g.lineStyle(Math.max(1, dpr * 1.5), theme.glow, 0.9);
  g.strokeCircle(entry.x, entry.y, cell * 0.42);

  // Holding slots.
  for (let i = 0; i < slotCount; i++) {
    const r = layout.slots[i]!;
    g.fillStyle(theme.dusk, 0.7);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, r.w * 0.22);
    g.lineStyle(Math.max(1, dpr), theme.mist, 0.35);
    g.strokeRoundedRect(r.x, r.y, r.w, r.h, r.w * 0.22);
  }

  // Portal: a slowly turning eight-point star in a halo.
  const { x, y, r } = layout.portal;
  const halo = scene.add
    .image(x, y, "glow")
    .setTint(theme.mist)
    .setDisplaySize(r * 4, r * 4);
  halo.setAlpha(0.5);
  const star = scene.add.graphics({ x, y });
  star.fillStyle(theme.glow, 1);
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 16; i++) {
    const rr = i % 2 === 0 ? r : r * 0.42;
    const a = (i / 16) * Math.PI * 2;
    points.push(new Phaser.Math.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  star.fillPoints(points, true);
  scene.tweens.add({ targets: star, angle: 360, duration: 12000, repeat: -1 });
  scene.tweens.add({
    targets: halo,
    alpha: 0.25,
    duration: 1800,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });
  objects.push(halo, star);
  return objects;
}
