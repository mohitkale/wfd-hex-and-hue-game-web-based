import * as collect from "@hexhue/core/collect";
import type Phaser from "phaser";
import { theme } from "../theme";
import type { CollectLayout } from "./collectLayout";
import { GroupBadge } from "./GroupBadge";

type CollectState = collect.CollectState;

type Place = "column" | "field" | "slot";

interface Tracked {
  badge: GroupBadge;
  place: Place;
  index: number;
  depth: number;
  completing: boolean;
}

/** How many queued groups are drawn per column (the front one plus peeks behind it). */
const PEEK = 2;

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
  g.lineStyle(Math.max(1, dpr * 1.5), theme.mist, 0.28);
  for (const r of [...l.field, ...l.slots]) g.strokeRoundedRect(r.x, r.y, r.w, r.h, r.h * 0.2);
}

export class PanelsView {
  private readonly tracked = new Map<number, Tracked>();
  private readonly extra: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: CollectLayout,
    private readonly palette: readonly string[],
    private readonly atlas: string,
    private readonly dpr: number,
    private readonly colorblind = false,
  ) {
    this.drawFrames();
  }

  /** The label of each row (the outlines are part of the baked static layer). */
  private drawFrames(): void {
    const l = this.layout;
    const label = (text: string, r: { x: number; y: number }) => {
      const t = this.scene.add
        .text(r.x + 6 * this.dpr, r.y + 4 * this.dpr, text, {
          fontFamily: theme.font,
          fontSize: `${Math.round(9 * this.dpr)}px`,
          color: theme.textDim,
        })
        .setOrigin(0, 0)
        .setDepth(9)
        .setAlpha(0.7);
      this.extra.push(t);
    };
    if (l.field[0]) label("WORKING", l.field[0]);
    if (l.slots[0]) label("WAITING", l.slots[0]);
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

  private rectFor(place: Place, index: number, depth: number) {
    const l = this.layout;
    if (place === "field") {
      const r = l.field[index] ?? l.field[l.field.length - 1]!;
      return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h, mini: false };
    }
    if (place === "slot") {
      const r = l.slots[index] ?? l.slots[0]!;
      return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h, mini: false };
    }
    const r = l.columns[index]!;
    if (depth === 0) {
      const h = Math.min(r.h * 0.6, r.w * 1.05);
      return { x: r.x + r.w / 2, y: r.y + h / 2 + r.h * 0.02, w: r.w * 0.94, h, mini: false };
    }
    const miniH = Math.min(r.h * 0.17, r.w * 0.3);
    const top = r.y + Math.min(r.h * 0.6, r.w * 1.05) + r.h * 0.04;
    return {
      x: r.x + r.w / 2,
      y: top + (depth - 0.5) * (miniH + r.h * 0.02),
      w: r.w * (depth === 1 ? 0.8 : 0.66),
      h: miniH,
      mini: true,
    };
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
        continue;
      }
      const rect = this.rectFor(target.place, target.index, target.depth);
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
        atlas: this.atlas,
        number: remaining,
        dpr: this.dpr,
        mini: rect.mini,
        symbol: this.colorblind,
      });
      badge.setDepth(10 + (target.place === "column" ? 2 - target.depth : 0));
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
      scale: completed ? 1.25 : 0.6,
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
