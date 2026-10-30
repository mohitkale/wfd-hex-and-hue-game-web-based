import type * as collect from "@hexhue/core/collect";
import type { FrameName } from "./familiarArt";

type CollectEvent = collect.CollectEvent;
type CollectState = collect.CollectState;

/** What a familiar is doing this tick, as far as the picture is concerned. */
export type Mode = "idle" | "walk" | "pickup" | "carry" | "deliver" | "retiring";

export interface FamiliarVisual {
  id: number;
  group: number;
  /** Palette index of its colour. */
  colorIndex: number;
  mode: Mode;
  /** Padded-grid cells: where this tick's move started and ended (equal when standing). */
  from: number;
  to: number;
  /** Palette index of the cube it is holding (from pickup until delivery), or null. */
  carried: number | null;
  /** Palette index of the cube it dropped through the portal this tick (for the delivery effect). */
  delivered: number | null;
  /** The cube cell it was sent for, while it is heading there. */
  target: number | null;
  /** Tick at which `mode` was entered. */
  since: number;
  /** Route indices where this tick's move started and ended (0 is the portal end), for the gate. */
  atFrom: number;
  atTo: number;
}

/**
 * Follows the engine's event stream and keeps one visual record per familiar. It holds no game
 * rules: everything it knows comes from events (or, after a resize or undo, from a state snapshot).
 * Pure and Phaser-free so positions and poses are unit tested.
 */
export class VisualModel {
  readonly familiars = new Map<number, FamiliarVisual>();

  constructor(
    /** Padded index of the portal cell. */
    readonly portal: number,
    /** Palette index of a group's colour. */
    private readonly groupColor: (group: number) => number,
  ) {}

  apply(e: CollectEvent, tick: number): void {
    switch (e.type) {
      case "familiarSpawned":
        this.familiars.set(e.familiar, {
          id: e.familiar,
          group: e.group,
          colorIndex: this.groupColor(e.group),
          // A zero-move route means the cube is next to the portal: it picks up straight away.
          mode: e.routeLength === 0 ? "pickup" : "idle",
          from: this.portal,
          to: this.portal,
          carried: null,
          delivered: null,
          target: null,
          since: tick,
          atFrom: 0,
          atTo: 0,
        });
        return;
      case "cubeReserved": {
        const v = this.familiars.get(e.familiar);
        if (v) v.target = e.cube;
        return;
      }
      case "familiarMoved": {
        const v = this.familiars.get(e.familiar);
        if (!v) return;
        v.mode = e.carrying ? "carry" : "walk";
        v.from = e.from;
        v.to = e.to;
        v.atFrom = e.carrying ? e.at + 1 : e.at - 1;
        v.atTo = e.at;
        v.delivered = null;
        v.since = tick;
        return;
      }
      case "cubePickedUp": {
        const v = this.familiars.get(e.familiar);
        if (!v) return;
        v.mode = "pickup";
        v.from = v.to;
        v.atFrom = v.atTo;
        v.carried = e.color;
        v.delivered = null;
        v.target = null;
        v.since = tick;
        return;
      }
      case "cubeDelivered": {
        const v = this.familiars.get(e.familiar);
        if (!v) return;
        v.mode = "deliver";
        v.from = this.portal;
        v.to = this.portal;
        v.atFrom = 0;
        v.atTo = 0;
        v.delivered = v.carried;
        v.carried = null;
        v.since = tick;
        return;
      }
      case "familiarRetired": {
        const v = this.familiars.get(e.familiar);
        if (v) {
          v.mode = "retiring";
          v.carried = null;
          v.delivered = null;
          v.since = tick;
        }
        return;
      }
      default:
        return;
    }
  }

  /** Drops a familiar whose retire animation has finished. */
  remove(id: number): void {
    this.familiars.delete(id);
  }

  /** Rebuilds every visual from a state snapshot (after a resize, undo or restart). */
  resync(state: Readonly<CollectState>): void {
    this.familiars.clear();
    for (const f of state.familiars) {
      const group = state.groups[f.group]!;
      const here = f.route[f.at] ?? this.portal;
      let mode: Mode = "idle";
      let from = here;
      let carried: number | null = null;
      const delivered: number | null = null;
      let atFrom = f.at;
      switch (f.status) {
        case "toCube":
          mode = "walk";
          from = f.route[f.at - 1] ?? here;
          atFrom = Math.max(0, f.at - 1);
          break;
        case "carrying":
          mode = "carry";
          from = f.route[f.at + 1] ?? here;
          atFrom = f.at + 1;
          carried = group.color;
          break;
        case "pickup":
          // `pickup` lasts exactly one tick: a familiar with a route has just walked in this tick
          // (the grab itself happens on the next one); one without a route spawned right there.
          if (f.at > 0) {
            mode = "walk";
            from = f.route[f.at - 1] ?? here;
            atFrom = f.at - 1;
          } else {
            mode = "pickup";
          }
          break;
        case "deliver":
          // Arrived at the portal with the cube: the delivery itself happens on the next tick, so
          // until then the picture is still "carrying" (the `cubeDelivered` event starts the drop).
          mode = "carry";
          from = f.route[f.at + 1] ?? here;
          atFrom = f.at + 1;
          carried = group.color;
          break;
        case "idle":
          break;
      }
      this.familiars.set(f.id, {
        id: f.id,
        group: f.group,
        colorIndex: group.color,
        mode,
        from,
        to: here,
        carried,
        delivered,
        target: f.status === "toCube" || f.status === "pickup" ? f.cube : null,
        since: state.tick,
        atFrom,
        atTo: f.at,
      });
    }
  }
}

/** Interpolated position between two cell centres. `alpha` is progress through the tick. */
export function lerpPoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
  alpha: number,
): { x: number; y: number } {
  const t = Math.max(0, Math.min(1, alpha));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

const WALK = ["walk0", "walk1", "walk2", "walk3", "walk4", "walk5"] as const;
const CARRY = ["carry0", "carry1", "carry2", "carry3", "carry4", "carry5"] as const;

/**
 * The sprite frame for a visual at `tick`. Walking and carrying show frame `stride` of the cycle
 * (`gait.ts` picks it from the distance walked, so the legs keep pace with the ground); standing
 * still alternates with the tick.
 */
export function frameFor(v: FamiliarVisual, tick: number, stride = 0): FrameName {
  switch (v.mode) {
    case "walk":
      return WALK[stride] ?? "walk0";
    case "carry":
      return CARRY[stride] ?? "carry0";
    case "pickup":
      return "pickup";
    case "deliver":
      return "deliver";
    case "retiring":
    case "idle":
      return (tick + v.id) % 2 === 0 ? "idle0" : "idle1";
  }
}
