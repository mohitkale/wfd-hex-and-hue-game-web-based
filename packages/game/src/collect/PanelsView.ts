import * as collect from "@hexhue/core/collect";
import type Phaser from "phaser";
import { theme } from "../theme";
import type { CollectLayout } from "./collectLayout";
import { badgeBox, PEEK, type Place } from "./badgeBox";
import { activeColumnRects } from "./collectLayout";
import { assignTrays } from "./trays";
import { GroupBadge } from "./GroupBadge";
import { leaveScale } from "./swarm";

type CollectState = collect.CollectState;

interface Tracked {
  badge: GroupBadge;
  place: Place;
  index: number;
  depth: number;
  completing: boolean;
  /** Working or waiting (trays), or queued (columns): what the box shows. */
  mode: "queued" | "working" | "waiting";
}

/**
 * The bottom of the screen: summon columns (only the front group of each is tappable; at most three
 * boxes of a column are drawn, as a grid, and the columns centre as a group when one runs out), the
 * active boxes (bordered: as many as may work at once; a working box opens its tray and the
 * familiars come out of it) and the holding slots (waiting groups). It places one badge per
 * group from the state and moves it when the group changes place. No game rules live here.
 */
/** Paints the empty tray outlines into `g` (the scene bakes them into its static layer). */
export function paintPanelFrames(
  g: Phaser.GameObjects.Graphics,
  l: CollectLayout,
  dpr: number,
): void {
  // One row of trays, always drawn: a box moves into one when it is tapped and stays there while it
  // works and while it waits; its state shows on the box itself.
  g.lineStyle(Math.max(1, dpr * 1.5), theme.mist, 0.34);
  for (const r of l.trays) g.strokeRoundedRect(r.x, r.y, r.w, r.h, r.h * 0.22);
}

export class PanelsView {
  private readonly tracked = new Map<number, Tracked>();
  private readonly anchorOut = { x: 0, y: 0 };
  /** Which tray each working or waiting group sits in (it keeps its tray while it stalls and resumes). */
  private trayOf = new Map<number, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: CollectLayout,
    private readonly palette: readonly string[],
    private readonly dpr: number,
    private readonly colorblind = false,
    private readonly reduced = false,
  ) {}

  destroy(): void {
    for (const t of this.tracked.values()) t.badge.destroy();
    this.tracked.clear();
  }

  /** Where group `id` should be drawn now, or null if it is not drawn (finished, or too deep in a column). */
  private target(
    s: Readonly<CollectState>,
    id: number,
    views: readonly collect.GroupView[],
  ): { place: Place; index: number; depth: number } | null {
    const g = s.groups[id]!;
    if (g.status === "working" || g.status === "waiting") {
      const tray = this.trayOf.get(id);
      return tray === undefined ? null : { place: "tray", index: tray, depth: 0 };
    }
    if (g.status === "queued") {
      const view = views[id]!;
      if (view.column === null || view.depth === null || view.depth > PEEK) return null;
      return { place: "column", index: view.column, depth: view.depth };
    }
    return null;
  }

  /** Re-places every badge for `state`. Call after each tick batch, tap, undo or resize. */
  sync(state: Readonly<CollectState>): void {
    this.trayOf = assignTrays(this.trayOf, state.groups, this.layout.trays.length);
    const views = collect.groupViews(state);
    // Columns that still hold a box, centred as a group.
    const colRects = activeColumnRects(
      this.layout,
      state.columns.map((c) => c.length > 0),
    );
    for (const g of state.groups) {
      const target = this.target(state, g.id, views);
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
        // The same tray, a new state: a box that stalls closes its tray and sleeps; one that resumes opens it.
        const mode =
          g.status === "working" ? "working" : g.status === "waiting" ? "waiting" : "queued";
        if (mode !== t.mode) {
          t.mode = mode;
          if (mode === "waiting") t.badge.closeTray(() => undefined);
          t.badge.setMode(mode);
          if (mode === "working") t.badge.openTray();
        }
        // A column that ran out of boxes left, and the rest slid to the middle: follow.
        if (target.place === "column") {
          const at = badgeBox(
            this.layout,
            "column",
            target.index,
            target.depth,
            colRects[target.index] ?? undefined,
          );
          if (Math.abs(t.badge.x - at.x) > 0.5) {
            this.scene.tweens.killTweensOf(t.badge);
            this.scene.tweens.add({
              targets: t.badge,
              x: at.x,
              y: at.y,
              duration: 240,
              ease: "Cubic.easeOut",
            });
          }
        }
        continue;
      }
      const rect = badgeBox(
        this.layout,
        target.place,
        target.index,
        target.depth,
        target.place === "column" ? (colRects[target.index] ?? undefined) : undefined,
      );
      const from = t && !t.completing ? { x: t.badge.x, y: t.badge.y } : null;
      // A working box that merely moves to another active place keeps its tray open.
      const wasOpen = t !== undefined && !t.completing && t.badge.isOpen;
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
        symbol: this.colorblind,
      });
      badge.setDepth(10 + (target.place === "column" ? 2 - target.depth : 0));
      badge.setMode(
        g.status === "working" ? "working" : g.status === "waiting" ? "waiting" : "queued",
      );
      badge.setProgress(g.delivered / g.capacity);
      if (g.status === "working") badge.openTray(wasOpen);
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
      this.tracked.set(g.id, {
        badge,
        ...target,
        completing: false,
        mode: g.status === "working" ? "working" : g.status === "waiting" ? "waiting" : "queued",
      });
    }
  }

  /** A group left the picture: its tray closes first, then it is removed (with a celebration if it completed). */
  private finish(id: number, t: Tracked, completed: boolean): void {
    t.completing = true;
    this.scene.tweens.killTweensOf(t.badge);
    t.badge.closeTray(() => {
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
    });
  }

  /** The tray group `id` sits in, or null (in a column, or finished). */
  trayOfGroup(id: number): number | null {
    return this.trayOf.get(id) ?? null;
  }

  /** Where the familiars of group `id` come out of (and return to): the open tray on its box, or null if it has none. */
  anchor(id: number): { x: number; y: number } | null {
    const t = this.tracked.get(id);
    if (!t) return null;
    // One shared object (read it at once): the renderer asks every frame, so nothing is allocated.
    this.anchorOut.x = t.badge.x;
    this.anchorOut.y = t.badge.y - this.layout.tile * 0.3;
    return this.anchorOut;
  }

  /** The badge of group `id` (for pop effects), if drawn. */
  badge(id: number): GroupBadge | undefined {
    return this.tracked.get(id)?.badge;
  }
}
