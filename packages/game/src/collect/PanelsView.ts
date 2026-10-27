import * as collect from "@hexhue/core/collect";
import type Phaser from "phaser";
import { theme } from "../theme";
import type { CollectLayout } from "./collectLayout";
import { badgeBox, PEEK, type Place } from "./badgeBox";
import { GroupBadge } from "./GroupBadge";
import { leaveScale } from "./swarm";

type CollectState = collect.CollectState;

interface Tracked {
  badge: GroupBadge;
  place: Place;
  index: number;
  depth: number;
  completing: boolean;
}

/**
 * The bottom of the screen: summon columns (only the front group of each is tappable), the field
 * strip (groups with familiars out) and the holding slots (waiting groups). It places one badge per
 * group from the state and moves it when the group changes place. No game rules live here.
 */
/** Paints the empty field and slot outlines into `g` (the scene bakes them into its static layer). */
export function paintPanelFrames(
  g: Phaser.GameObjects.Graphics,
  l: CollectLayout,
  dpr: number,
): void {
  // Only the holding slots are outlined (they are a limit the player manages); there is no outline
  // for the field: working groups just appear, and show their state on their own box.
  g.lineStyle(Math.max(1, dpr * 1.5), theme.mist, 0.28);
  for (const r of l.slots) g.strokeRoundedRect(r.x, r.y, r.w, r.h, r.h * 0.22);
}

export class PanelsView {
  private readonly tracked = new Map<number, Tracked>();
  private readonly extra: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: CollectLayout,
    private readonly palette: readonly string[],
    private readonly dpr: number,
    private readonly colorblind = false,
    private readonly reduced = false,
  ) {
    this.drawFrames();
  }

  /** The label of the holding row (the outlines are part of the baked static layer). */
  private drawFrames(): void {
    const l = this.layout;
    if (!l.slots[0]) return;
    const t = this.scene.add
      .text(l.slots[0].x + 5 * this.dpr, l.slots[0].y + 3 * this.dpr, "WAITING", {
        fontFamily: theme.font,
        fontSize: `${Math.round(9 * this.dpr)}px`,
        color: theme.textDim,
      })
      .setOrigin(0, 0)
      .setDepth(9)
      .setAlpha(0.7);
    this.extra.push(t);
  }

  destroy(): void {
    for (const t of this.tracked.values()) t.badge.destroy();
    this.tracked.clear();
    for (const o of this.extra) o.destroy();
    this.extra.length = 0;
  }

  /** Where group `id` should be drawn now, or null if it is not drawn (finished, or too deep in a column). */
  private target(
    s: Readonly<CollectState>,
    id: number,
    working: number[],
    views: readonly collect.GroupView[],
  ): { place: Place; index: number; depth: number } | null {
    const g = s.groups[id]!;
    if (g.status === "working") return { place: "field", index: working.indexOf(id), depth: 0 };
    if (g.status === "waiting") return { place: "slot", index: s.slots.indexOf(id), depth: 0 };
    if (g.status === "queued") {
      const view = views[id]!;
      if (view.column === null || view.depth === null || view.depth > PEEK) return null;
      return { place: "column", index: view.column, depth: view.depth };
    }
    return null;
  }

  /** Re-places every badge for `state`. Call after each tick batch, tap, undo or resize. */
  sync(state: Readonly<CollectState>): void {
    const working = state.groups.filter((g) => g.status === "working").map((g) => g.id);
    const views = collect.groupViews(state);
    for (const g of state.groups) {
      const target = this.target(state, g.id, working, views);
      const t = this.tracked.get(g.id);
      const remaining = g.capacity - g.delivered;
      if (!target) {
        if (t && !t.completing) {
          // Show the engine's number (0 for a finished group) before it leaves, never a stale one.
          t.badge.setNumber(remaining);
          this.finish(g.id, t, g.status === "completed");
        }
        continue;
      }
      if (
        t &&
        !t.completing &&
        t.place === target.place &&
        t.index === target.index &&
        t.depth === target.depth
      ) {
        t.badge.setNumber(remaining);
        t.badge.setProgress(g.delivered / g.capacity);
        continue;
      }
      const rect = badgeBox(this.layout, target.place, target.index, target.depth);
      const from = t && !t.completing ? { x: t.badge.x, y: t.badge.y } : null;
      if (t) {
        this.scene.tweens.killTweensOf(t.badge);
        t.badge.destroy();
      }
      const badge = new GroupBadge(this.scene, from?.x ?? rect.x, from?.y ?? rect.y, {
        w: rect.w,
        h: rect.h,
        colorHex: this.palette[g.color]!,
        colorIndex: g.color,
        number: remaining,
        dpr: this.dpr,
        mini: rect.mini,
        symbol: this.colorblind,
      });
      badge.setDepth(10 + (target.place === "column" ? 2 - target.depth : 0));
      badge.setMode(
        g.status === "working" ? "working" : g.status === "waiting" ? "waiting" : "queued",
      );
      badge.setProgress(g.delivered / g.capacity);
      this.scene.add.existing(badge);
      if (from) {
        this.scene.tweens.add({
          targets: badge,
          x: rect.x,
          y: rect.y,
          duration: 220,
          ease: "Cubic.easeOut",
        });
      }
      this.tracked.set(g.id, { badge, ...target, completing: false });
    }
  }

  /** A group left the picture: celebrate if it completed, then remove its badge. */
  private finish(id: number, t: Tracked, completed: boolean): void {
    t.completing = true;
    this.scene.tweens.killTweensOf(t.badge);
    this.scene.tweens.add({
      targets: t.badge,
      scale: leaveScale(completed, this.reduced),
      alpha: 0,
      duration: completed ? 260 : 140,
      ease: "Sine.easeOut",
      onComplete: () => {
        t.badge.destroy();
        if (this.tracked.get(id) === t) this.tracked.delete(id);
      },
    });
  }

  /** The badge of group `id` (for pop effects), if drawn. */
  badge(id: number): GroupBadge | undefined {
    return this.tracked.get(id)?.badge;
  }
}
