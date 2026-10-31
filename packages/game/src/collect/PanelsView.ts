import * as collect from "@hexhue/core/collect";
import type Phaser from "phaser";
import type { CollectLayout } from "./collectLayout";
import { badgeBox, PEEK, type Place } from "./badgeBox";
import { activeColumnRects } from "./collectLayout";
import { assignTrays } from "./trays";
import { GroupBadge } from "./GroupBadge";
import { leaveScale } from "./swarm";
import { paintPlate } from "./tableLook";

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
  // One row of trays, always drawn: a pale plate a box stands on once it is tapped; it stays there
  // while it works and while it waits, and its state shows on the box itself.
  for (const r of l.trays) paintPlate(g, r, dpr);
}

/** A shared-tray box whose familiars have all come out: it no longer sits in a tray. */
function allOut(
  s: Readonly<CollectState>,
  g: Readonly<collect.CollectState["groups"][number]>,
): boolean {
  return (
    s.params.sharedTrays === true &&
    g.status === "working" &&
    g.capacity - g.delivered - g.committed <= 0
  );
}

/** How long a box takes to move to its tray, and its tray to open, at 1× (both shorten with 3×). */
const MOVE_MS = 220;
const OPEN_MS = 140;

export class PanelsView {
  /**
   * The speed shown now (set by the scene): a box's move and its tray's opening play this much faster,
   * so they finish within the engine's `openDelay` at 3× as at 1× (M15.13).
   */
  speed = 1;
  private readonly tracked = new Map<number, Tracked>();
  /** Told after every sync which tray each box is in (the scene keeps it across a rebuild). */
  onTrays: ((trays: ReadonlyMap<number, number>) => void) | null = null;
  private readonly anchorOut = { x: 0, y: 0 };
  /** Where boxes that emptied their tray stood, so their last familiars still set off from there. */
  private readonly gone = new Map<number, { x: number; y: number }>();
  /** Which tray each working or waiting group sits in (it keeps its tray while it stalls and resumes). */
  private trayOf: Map<number, number>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: CollectLayout,
    private readonly palette: readonly string[],
    private readonly dpr: number,
    private readonly colorblind = false,
    private readonly reduced = false,
    /** Trays from before a rebuild: boxes keep their place when the screen is laid out again. */
    initialTrays: ReadonlyMap<number, number> = new Map(),
  ) {
    this.trayOf = new Map(initialTrays);
  }

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
    // Shared trays: once every familiar of a box is out, the box has left its tray (M15.13).
    if (allOut(s, g)) return null;
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
    const occupants = state.groups.map((g) =>
      allOut(state, g) ? { id: g.id, status: "completed" } : g,
    );
    this.trayOf = assignTrays(this.trayOf, occupants, this.layout.trays.length);
    this.onTrays?.(this.trayOf);
    const views = collect.groupViews(state);
    // Columns that still hold a box, centred as a group.
    const colRects = activeColumnRects(
      this.layout,
      state.columns.map((c) => c.length > 0),
    );
    for (const g of state.groups) {
      const target = this.target(state, g.id, views);
      const t = this.tracked.get(g.id);
      // With shared trays the count is the familiars still inside the box (it drops as each comes
      // out); otherwise the cubes it can still deliver.
      const remaining = state.params.sharedTrays
        ? g.capacity - g.delivered - g.committed
        : g.capacity - g.delivered;
      if (!target) {
        if (t && !t.completing) {
          // A finished box just leaves its tray: it never shows 0 (M15.13).
          if (allOut(state, g)) this.leaveEmpty(g.id, t);
          else this.finish(g.id, t, g.status === "completed");
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
        t.badge.setSwept((g.flying ?? 0) > 0);
        t.badge.setProgress(state.params.sharedTrays ? 0 : g.delivered / g.capacity);
        // The same tray, a new state: a box that stalls closes its tray and sleeps; one that resumes opens it.
        const mode =
          g.status === "working" ? "working" : g.status === "waiting" ? "waiting" : "queued";
        if (mode !== t.mode) {
          t.mode = mode;
          // The tray stays open while a box waits: it resumes by itself the moment it can reach a cube.
          t.badge.setMode(mode);
        }
        // A column that ran out of boxes left, and the rest moved to the middle: follow at once. The
        // tap zones move at once too, so a slide would leave the box where no tap reaches it.
        if (target.place === "column") {
          const at = badgeBox(
            this.layout,
            "column",
            target.index,
            target.depth,
            colRects[target.index] ?? undefined,
          );
          t.badge.setRaised(target.depth === 0);
          if (Math.abs(t.badge.x - at.x) > 0.5) {
            this.scene.tweens.killTweensOf(t.badge);
            t.badge.setPosition(at.x, at.y).setScale(1);
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
      // Within the columns a box only slides up; sideways it is where its tap zone is at once.
      if (from && target.place === "column") from.x = rect.x;
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
        raised: target.place !== "column" || target.depth === 0,
      });
      badge.setDepth(10 + (target.place === "column" ? 2 - target.depth : 0));
      if (target.place === "tray") badge.setInTray();
      badge.setMode(
        g.status === "working" ? "working" : g.status === "waiting" ? "waiting" : "queued",
      );
      badge.setProgress(state.params.sharedTrays ? 0 : g.delivered / g.capacity);
      // A box that lands in a tray opens it once it has arrived; the familiars come out after.
      if (g.status === "working" || g.status === "waiting")
        badge.openTray(wasOpen, from ? MOVE_MS / this.speed : 0, OPEN_MS / this.speed);
      this.scene.add.existing(badge);
      if (from) {
        this.scene.tweens.add({
          targets: badge,
          x: rect.x,
          y: rect.y,
          duration: MOVE_MS / this.speed,
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

  /**
   * Shared trays: the last familiar is out, so the box leaves its tray at once (no 0 is ever shown,
   * no lid closing). Its last familiars keep its tray as the point they set off from.
   */
  private leaveEmpty(id: number, t: Tracked): void {
    t.completing = true;
    this.gone.set(id, { x: t.badge.x, y: t.badge.y - this.layout.tile * 0.3 });
    this.scene.tweens.killTweensOf(t.badge);
    this.scene.tweens.add({
      targets: t.badge,
      scale: leaveScale(true, this.reduced),
      alpha: 0,
      duration: 200,
      ease: "Sine.easeOut",
      onComplete: () => {
        t.badge.destroy();
        if (this.tracked.get(id) === t) this.tracked.delete(id);
      },
    });
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

  /** The box sitting in tray `tray`, or null when it is empty. */
  groupInTray(tray: number): number | null {
    for (const [id, t] of this.trayOf) if (t === tray) return id;
    return null;
  }

  /** The tray group `id` sits in, or null (in a column, or finished). */
  trayOfGroup(id: number): number | null {
    return this.trayOf.get(id) ?? null;
  }

  /** Where the familiars of group `id` come out of: its box's tray once open, or null (closed, or no box). */
  anchor(id: number): { x: number; y: number } | null {
    const t = this.tracked.get(id);
    if (!t || t.completing) return this.gone.get(id) ?? null;
    // Until its tray has opened, nothing comes out of a box.
    if (!t.badge.isReady) return null;
    // One shared object (read it at once): the renderer asks every frame, so nothing is allocated.
    this.anchorOut.x = t.badge.x;
    this.anchorOut.y = t.badge.y - this.layout.tile * 0.3;
    return this.anchorOut;
  }

  /**
   * The badge of group `id` (for pop effects), if drawn and not leaving: an effect on a leaving box
   * would cancel its exit and leave it stuck half-faded in its tray.
   */
  badge(id: number): GroupBadge | undefined {
    const t = this.tracked.get(id);
    return t && !t.completing ? t.badge : undefined;
  }
}
