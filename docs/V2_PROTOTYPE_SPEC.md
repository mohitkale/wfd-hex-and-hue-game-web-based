# v2 Prototype and Vertical-Slice Technical Design

_Written in M8.5. Rules: `docs/GAME_DESIGN_V2.md`. Difficulty targets: `docs/DIFFICULTY_V2.md`. Why: `docs/V2_GAMEPLAY_AUDIT.md`.
This document is what M9 (engine) and M10 (collectors, vertical slice) are implemented from._

## 1. Scope and non-goals

**Goal:** one playable vertical slice on the new rules, with real pick-up-and-deliver movement,
limited slots, recognisable magical art, one winning and one losing sequence, running behind
`?engine=v2` while the shipped v1 game stays untouched on `main`.

**Non-goals for the slice:** world map integration, saves for v2 levels, boosters, daily
challenges, bulk art, a generator. A single hand-designed level is enough (M10.5); the solver and
generator come in M12.

## 2. Data model (plain, JSON-serialisable; `packages/core/src/collect/`)

```ts
/** A level as authored and shipped. */
interface CollectLevel {
  id: string;
  name: string;
  width: number; // mosaic cells, 1..40
  height: number; // 1..40
  palette: string[]; // #rrggbb, 1..16
  cells: number[]; // row-major, y = 0 top; palette index or EMPTY (-1)
  columns: GroupSpec[][]; // columns[c][0] is the front; 1..6 columns
  slots: number; // K, 1..8
  squad: number; // familiars per group at once, 1..6
  spawnGap: number; // ticks between spawns of one group, >= 1
  fieldCap: number; // groups working at once, 1..6
  portalX?: number; // default floor((width - 1) / 2)
}
interface GroupSpec {
  color: number;
  capacity: number; // >= 1
}
```

`validateCollectLevel` checks: shape and limits above; palette colours; per-colour capacity total
equals cube count (GAME_DESIGN_V2 §3); every group colour exists on the board; at least one front
group has an accessible cube (R-20); group ids are assigned `0..n−1` in level order.

```ts
type GroupStatus = "queued" | "working" | "waiting" | "completed";
interface GroupState {
  id: number;
  color: number;
  capacity: number;
  delivered: number;
  committed: number; // cubes reserved or carried by this group's familiars
  status: GroupStatus;
  nextSpawn: number; // first tick at which it may spawn
  slot: number | null; // while waiting
}
type FamiliarStatus = "toCube" | "pickup" | "carrying" | "deliver" | "idle";
interface Familiar {
  id: number; // global monotonic counter, never reused
  group: number;
  status: FamiliarStatus;
  /** Cell indices (padded grid) from the portal to the standing cell, inclusive. */
  route: number[];
  /** Index into `route` of the familiar's current cell (0 = portal). */
  at: number;
  /** Padded-grid index of the reserved cube's cell. */
  cube: number;
}
interface CollectState {
  tick: number;
  status: "playing" | "won" | "lost";
  lossReason: "slotsFull" | "deadlock" | null;
  /** Padded grid ((w+2)*(h+2)): colour index, or EMPTY for open cells (ring and emptied). */
  grid: number[];
  /** Same indexing: shortest walking distance from the portal, or -1 if not reachable. */
  dist: number[];
  /** 1 where a cube is reserved. */
  reserved: number[];
  groups: GroupState[];
  columns: number[][]; // group ids still queued, front first
  slots: (number | null)[]; // group id or null
  familiars: Familiar[];
  nextFamiliarId: number;
  deliveredTotal: number;
  cubesTotal: number;
}
```

All fields are numbers, strings, booleans, arrays and plain objects, so `structuredClone` and
`JSON.stringify` work. The per-colour accessible sets of GAME_DESIGN_V2 §4a are **derived caches**
held outside the serialised state (rebuilt from `dist` and `grid` on load, `cloneState` copies or
rebuilds them); they never appear in a state hash.

## 3. Public API (what the renderer, solver and tests use)

```ts
createCollectState(level): CollectState
legalActions(s): Action[]                 // fronts by column, then waiting by slot (DIFFICULTY_V2 §2 order)
apply(s, action): CollectEvent[]          // select / resume; throws on illegal (UI checks legality first)
step(s): CollectEvent[]                   // one tick (GAME_DESIGN_V2 §7); [] if settled or finished
runUntilSettled(s, maxTicks?): CollectEvent[]
isSettled(s): boolean
cloneState(s): CollectState
stateKey(s): string                       // solver identity: columns, waiting (colour, remaining), cubes
hashState(s): string                      // full logical hash for replay tests (excludes derived caches)
type Action = { kind: "select"; column: number } | { kind: "resume"; slot: number }
type LogEntry = { tick: number; action: Action }
replay(level, log: LogEntry[], untilTick?): { state: CollectState; events: CollectEvent[] }
class CollectSession                      // action log, undo snapshots (one per action), subscribe(), tick()
```

`CollectSession` (M9.4) is the only object the renderer touches: it owns the state, exposes it as
`Readonly<CollectState>`, applies `tap`/`tick`, records the log, and emits events. Undo restores
the snapshot taken before the last action.

### Events

```ts
type CollectEvent =
  | { type: "groupSelected"; group: number; column: number }
  | { type: "groupResumed"; group: number; slot: number }
  | { type: "familiarSpawned"; familiar: number; group: number; cube: number; routeLength: number }
  | { type: "familiarMoved"; familiar: number; from: number; to: number; carrying: boolean }
  | { type: "cubeReserved"; familiar: number; cube: number }
  | { type: "cubePickedUp"; familiar: number; cube: number; color: number }
  | { type: "cubeDelivered"; familiar: number; group: number; color: number; remaining: number }
  | { type: "familiarRetired"; familiar: number }
  | { type: "groupParked"; group: number; slot: number; remaining: number } // "partial": remaining > 0
  | { type: "slotReleased"; slot: number }
  | { type: "groupCompleted"; group: number }
  | { type: "won" }
  | { type: "lost"; reason: "slotsFull" | "deadlock" };
```

(`groupPartial` in GAME_DESIGN_V2 §11 is `groupParked` with `remaining > 0`; one event, not two.)
Events carry cell indices of the padded grid. Events within a tick appear in phase order and then
in the iteration orders of GAME_DESIGN_V2 §7, so the sequence is deterministic and testable.

## 4. Module layout

```
packages/core/src/collect/          (new; exported as `collect` namespace from core's index)
  level.ts       CollectLevel, validateCollectLevel, parseCollectLevel
  grid.ts        padded grid helpers, neighbour order, dist init + incremental update, canonical descent
  state.ts       types above, createCollectState, cloneState, stateKey, hashState
  targeting.ts   accessible sets per colour, nearest-first target + standing cell, route
  actions.ts     legalActions, apply (select/resume)
  sim.ts         step (phases 0–4), runUntilSettled, isSettled
  events.ts      CollectEvent
  session.ts     CollectSession, replay
  *.test.ts      beside each module; fixtures in fixtures.ts (GAME_DESIGN_V2 §14 boards)
  (solver.ts, generator.ts, strategies.ts arrive in M12)

packages/game/src/collect/          (new, M10; dynamically imported, see §6)
  CollectScene.ts      board scene, input, HUD wiring
  Choreographer.ts     tick clock, event queue → view updates (no game rules)
  CubeLayer.ts         batched cube drawing, removal on pickup
  FamiliarLayer.ts     pooled familiar sprites, interpolation along routes
  PortalView.ts, SlotsView.ts, ColumnsView.ts
  familiar art / atlas (M10.1)
```

`packages/core/src/collect` imports nothing from `packages/game`, Phaser or the DOM, and nothing
from the v1 modules except `rng` and the `EMPTY` constant. v1 modules do not import `collect`.

## 5. Render ↔ simulation interface

- **The renderer drives the clock; the rules do not read time.** `Choreographer` keeps
  `tickClock += dt × ticksPerSecond × speed` and calls `session.tick()` once per whole tick,
  at most 4 per frame (more would mean the device is behind: it then drops decorative effects, never
  ticks). Logical time is the tick count.
- **Interpolation.** Each familiar's position is `route[at]` moving towards `route[at ± 1]`; the
  fractional part of the tick clock gives the alpha. Pickup and deliver are one-tick animations.
  Carried cubes are drawn attached to their familiar from `cubePickedUp` until `cubeDelivered`.
- **Views are functions of state + events.** The cube layer removes a cube on `cubePickedUp` (not on
  delivery: the cube has left the board and is carried); the group badge number is
  `capacity − delivered` and changes on `cubeDelivered`; the slot row is rebuilt from `slots`.
  Nothing in the game package mutates `CollectState`.
- **Speed.** `ticksPerSecond` is ≈ 10 at 1× (tuned in M10.4); 2× doubles `speed`. Outcomes are
  unaffected because only the tick rate changes. `squad`, `spawnGap` and `fieldCap` are level data
  and are never altered by the renderer.
- **Reduced motion** removes decorative motion (trails, bobbing, shake) but keeps ticks and
  deliveries; with it on, the tick rate is unchanged.
- **Input.** Tap targets are column fronts and filled slots. Legality is `legalActions`; an illegal
  tap shows why ("no reachable cube of this colour yet", "too many groups working") and costs nothing.

## 6. Feature flag and rollout (audit risk R1: `main` auto-deploys)

- `?engine=v2` on `/play/` (and `PUBLIC_ENGINE=v2` at build time for review builds) selects the v2
  board. Without it, nothing v2 is reachable: the default path is the v1 `PlayScene`.
- The v2 scene is loaded with a dynamic `import()` only when the flag is present. It is part of the
  build, so the existing budget (`_astro/*.js` total ≤ 450 KB gzip, currently 391.5 KB) applies to it:
  **v2 may use at most ~40 KB gzip until the switch**, and M10 measures it. If more is needed, the
  budget is raised for the review period in an explicit, reviewed change and restored at M15.5 when
  the v1 modules are deleted.
- v2 progress is not written to the player's save until the switch (M15.5); the flag runs a
  throwaway session. This keeps v1 saves safe.
- No v1 file changes behaviour. The only v1 edits allowed before M15.5 are the flag check in the
  game entry point and dev tooling.

## 7. Performance budget for collectors (audit risk R4)

| Item                  | Budget                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Live familiar sprites | ≤ `squad × fieldCap` ≤ 36, pooled; no allocation per frame                                                            |
| Cube drawing          | One batched layer (single draw call per colour page or one render texture); removal edits it, no per-cell GameObjects |
| Per-tick simulation   | ≤ 1 ms amortised on a mid-range phone for a 40×40 board (target; measured in M10.3)                                   |
| Pathfinding           | Only on assignment, incremental `dist`; none per frame (GAME_DESIGN_V2 §4a)                                           |
| Frame time            | ≤ 16.6 ms at 60 fps; measured on a mid-range Android in M10.3 and documented                                          |
| Texture memory        | One familiar atlas ≤ 512×512; no per-colour copies (tint at runtime)                                                  |

## 8. Vertical-slice content plan (the level built in M10.5)

**Subject:** a witch's cauldron over embers, with a bubbling potion: recognisable at a glance, and its
natural layering gives the dependency the rules need. (Final art direction and palette come from
M10.1/M11.1; if the cauldron cannot be made convincing in the grid, the subject is replaced, not
the requirements.)

| Colour family | Role in the picture | Role in the puzzle                                                            |
| ------------- | ------------------- | ----------------------------------------------------------------------------- |
| Ember orange  | fire at the base    | Accessible from the start (touches the bottom ring). Easy early delivery.     |
| Iron violet   | cauldron walls      | Wraps the potion: must go before the potion can be reached.                   |
| Potion green  | liquid              | Hidden behind violet; big group that **waits** if opened too early.           |
| Bubble cream  | bubbles and rim     | Partly outside, partly inside the green: mixed exposure.                      |
| Moon gold     | crescent in the sky | Isolated, independent: a "free" group that tempts the player to waste a slot. |

**Size and parameters:** about 22×22 (≈ 280–350 cubes), 5 colours, 4 columns holding 10–13 groups,
`K = 3`, `squad = 3`, `spawnGap = 2`, `fieldCap = 3`. Group capacities are chosen so that:

1. at least one group of each of violet and green has capacity larger than what is accessible when
   it is first selectable (it will wait);
2. the total capacity of every colour equals its cube count.

**Strategic choices (at least three, from the list):** (a) clear violet before opening green,
(b) which of two violet groups to open first (the other may be buried behind green), (c) whether to
park a half-finished group or open another, (d) when to resume a waiting group, (e) whether to spend
the third slot on the free gold group.

**Required sequences:** one **winning** line and one **losing** line, written as action logs and run
as headless tests (and shown in the build as "demo" scripts). The losing line must end in `slotsFull`
(and, if possible, a second line in `deadlock`). The structure of both is already demonstrated on a
small board in GAME_DESIGN_V2 §14 fixture B (three actions lose, two orders win); the slice level
must show the same kind of choice at full scale. Both lines are verified by the engine (M9.5) and
by an exhaustive search of the settled-sequential tree (small enough: ≤ 13 groups).

**Acceptance for M10.5:** meets `docs/DIFFICULTY_V2.md` medium bands except that the world-level
checks and `planningDepth` calibration do not apply to a single level; the human is asked about
feel (gate G1), not about the numbers.

## 9. Rule → module → test traceability

| GAME_DESIGN_V2 rule                         | Module               | Test task / fixture                                      |
| ------------------------------------------- | -------------------- | -------------------------------------------------------- |
| §3 level validity, group ids                | `level.ts`           | M9.1: validation cases, R-20                             |
| §4 reachable set, accessible cubes, pockets | `grid.ts`            | M9.1/M9.5: R-01…R-05, fixture D, incremental = fresh BFS |
| §4 targeting, ties, canonical descent       | `targeting.ts`       | M9.1: R-11, R-17, fixtures A and C                       |
| §5 group states, capacity bookkeeping, R-18 | `state.ts`, `sim.ts` | M9.2: conservation property test, purple-12/7 case       |
| §6 select / resume legality                 | `actions.ts`         | M9.3: fieldCap, no-assignable, illegal taps (fixture D)  |
| §7 phases 0–4, order, spawn rules           | `sim.ts`             | M9.1/M9.5: fixture A tick table, R-08, R-12              |
| §7 Phase 3 park / `slotsFull`               | `sim.ts`             | M9.3: fixture B line 3                                   |
| §8 win on delivery, `deadlock`              | `sim.ts`             | M9.3/M9.5: win ordering, fixture B, deadlock board       |
| §9 concurrency, reservation order           | `sim.ts`             | M9.5: fixture E (R-07), R-06                             |
| §10 settled model, state identity           | `state.ts`           | M9.5 → M12.1: solver replay equality                     |
| §11 determinism, events, replay             | `session.ts`         | M9.4: replay hash tests, event-order snapshots           |

## 10. Self-review checklist (acceptance gate for M8)

| Question                                     | Evidence                                                                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coherent: do the docs agree with each other? | Three independent reviews of GAME_DESIGN_V2 (two executed the rules in code); this spec only adds structure and the `groupParked` event naming.                 |
| Implementable without questions?             | §2–§4 give types, API and files; tick-level fixtures A and E, R-08 board and canonical descent leave no ordering open.                                          |
| Deterministic?                               | No RNG or clock in the rules; all iteration orders fixed (GAME_DESIGN_V2 §4, §7); `dist` is canonical; ids are counters.                                        |
| Testable?                                    | §9 maps every rule to a test; fixtures A–E and R-03/R-05/R-08 boards are written down.                                                                          |
| Losing sequence real?                        | Fixture B line 3: R:2 parks (slot 0 of 1), G:2 runs dry, no free slot → `slotsFull`. Checked by hand and by an independent executable implementation in review. |
| Keeps `main` safe?                           | §6: flag, dynamic import, no save writes, v1 untouched, budget stated.                                                                                          |
| Honest about what is not proven?             | Fun is unproven until the human gate G1. Difficulty bands are provisional (DIFFICULTY_V2). Performance numbers are targets until measured on a device in M10.3. |

## 11. Risks carried into M9/M10

- **Solver cost** with `squad`/`fieldCap` in the transition function (settled model keeps it
  tractable; measured in M12.1).
- **Feel of nearest-first targeting** (passive vs. satisfying); the demo run is how it gets judged.
- **Visual clarity** of many familiars carrying cubes at 320 px width; M10.1/M10.3 test it early.
- **Bundle size** of the v2 chunk against the 450 KB budget (§6).
