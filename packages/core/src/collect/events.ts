/** Why a game was lost (GAME_DESIGN_V2 §8). */
export type LossReason = "slotsFull" | "deadlock";

/**
 * Everything the renderer needs to follow a game (docs/V2_PROTOTYPE_SPEC.md §3). Cell values are
 * padded-grid indices. Within a tick events appear in phase order, then in the iteration orders of
 * GAME_DESIGN_V2 §7.
 */
export type CollectEvent =
  | { type: "groupSelected"; group: number; column: number }
  | { type: "groupResumed"; group: number; slot: number }
  | { type: "familiarSpawned"; familiar: number; group: number; routeLength: number }
  /** After a spawn, and whenever an idle familiar is given a new target. */
  | { type: "cubeReserved"; familiar: number; cube: number }
  /** `at` is the familiar's index along its route after the move (0 = the portal end). */
  | {
      type: "familiarMoved";
      familiar: number;
      from: number;
      to: number;
      carrying: boolean;
      at: number;
    }
  | { type: "cubePickedUp"; familiar: number; cube: number; color: number }
  | { type: "cubeDelivered"; familiar: number; group: number; color: number; remaining: number }
  | { type: "familiarRetired"; familiar: number }
  /** A working group ran out of assignable cubes with capacity left (`remaining > 0`). */
  | { type: "groupParked"; group: number; slot: number; remaining: number }
  | { type: "slotReleased"; slot: number }
  /** The Extra Slot booster added holding slot `slot` (docs/V2_BOOSTERS.md). */
  | { type: "slotAdded"; slot: number }
  | { type: "groupCompleted"; group: number }
  /** Familiar's Call (M15.13): box `group` moved from `from` (its depth) to the front of `column`. */
  | { type: "boxCalled"; group: number; column: number; from: number }
  /** Besom Sweep (M15.13): the next `cubes` familiars of `group` fly over the picture. */
  | { type: "boxSwept"; group: number; cubes: number }
  | { type: "won" }
  /** `group` is the group that ran dry for `slotsFull`, otherwise `null`. */
  | { type: "lost"; reason: LossReason; group: number | null };

/** The events of one tick, or of one applied action, with the tick they happened at. */
export interface TickBatch {
  tick: number;
  events: CollectEvent[];
}
