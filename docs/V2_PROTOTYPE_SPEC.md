# v2 Prototype and Vertical-Slice Technical Design

_Written in M8.5. Rules: `docs/GAME_DESIGN_V2.md`. Difficulty targets: `docs/DIFFICULTY_V2.md`. Why:
`docs/V2_GAMEPLAY_AUDIT.md`. This document is what M9 (engine) and M10 (collectors, vertical slice)
are implemented from; where a detail is left to a later task, §11 says so._

## 1. Scope and non-goals

**Goal:** one playable vertical slice on the new rules, with real pick-up-and-deliver movement,
limited slots, recognisable magical art, one winning and one losing sequence, running behind
`?engine=v2` while the shipped v1 game stays playable on `main`.

**Non-goals for the slice:** world map integration, saves for v2 levels, boosters, daily
challenges, bulk art, a generator. A single hand-designed level is enough (M10.5); the solver and
generator come in M12.

## 2. Data model (plain, JSON-serialisable; `packages/core/src/collect/`)

### Indexing

The padded grid has stride `w + 2` and holds the mosaic plus a 1-cell ring. The index of mosaic
cell `(x, y)` (and of ring cells with `x ∈ [-1, w]`, `y ∈ [-1, h]`) is

```
idx = (y + 1) * (w + 2) + (x + 1)
```

Padded indices increase with `y` first and then `x`, so **"smaller `y`, then smaller `x`" is exactly
"smaller `idx`"**; every tie-break in GAME_DESIGN_V2 uses this. `CollectLevel.cells` is the
authored, **unpadded** array (`cells[y * w + x]`); `createCollectState` pads it.

### Level (authored and shipped)

```ts
interface CollectLevel {
  id: string;
  name: string;
  width: number; // mosaic cells, 1..40
  height: number; // 1..40
  palette: string[]; // #rrggbb, 1..16
  cells: number[]; // unpadded, row-major, y = 0 top; palette index or EMPTY (-1)
  columns: GroupSpec[][]; // columns[c][0] is the front; 1..6 columns
  slots: number; // K, 1..8
  squad: number; // familiars per group at once, 1..6
  spawnGap: number; // ticks between spawns of one group, >= 1
  fieldCap: number; // groups working at once, 1..6
  portalX?: number; // 0..width-1; default floor((width - 1) / 2)
}
interface GroupSpec {
  color: number;
  capacity: number; // integer >= 1
}
```

`validateCollectLevel` checks: shape, integer fields and the limits above; `#rrggbb` palette; every
cell and group colour in range; per-colour capacity total equals cube count (GAME_DESIGN_V2 §3);
`portalX` range; at least one front group has an accessible cube (R-20, which needs `grid.ts`'s
reachability, so `level.ts` depends on `grid.ts`). Group ids are assigned `0..n−1` in level order and
are not stored in the level.

### State

```ts
/** Level constants copied into the state so every function needs only the state. Never mutated. */
interface CollectParams {
  width: number;
  height: number;
  stride: number; // width + 2
  portal: number; // padded index of the portal cell
  slots: number;
  squad: number;
  spawnGap: number;
  fieldCap: number;
}
type GroupStatus = "queued" | "working" | "waiting" | "completed";
interface GroupState {
  id: number;
  color: number;
  capacity: number;
  delivered: number;
  committed: number; // cubes reserved or carried by this group's familiars
  status: GroupStatus;
  nextSpawn: number; // first tick at which it may spawn
}
type FamiliarStatus = "toCube" | "pickup" | "carrying" | "deliver" | "idle";
interface Familiar {
  id: number; // global monotonic counter, never reused
  group: number;
  status: FamiliarStatus;
  /** Padded indices from the portal to the standing cell, inclusive; `[]` when idle. */
  route: number[];
  /** Index into `route` of the familiar's current cell (0 = portal); 0 when idle. */
  at: number;
  /** Padded index of the reserved cube's cell; -1 when idle. */
  cube: number;
}
interface CollectState {
  params: CollectParams;
  tick: number;
  status: "playing" | "won" | "lost";
  lossReason: "slotsFull" | "deadlock" | null;
  /** Padded grid: colour index for a cube, EMPTY (-1) for open cells (ring and emptied). */
  grid: number[];
  /** Derived: walking distance from the portal through open cells, or -1. Rebuildable from `grid`. */
  dist: number[];
  /** Derived: 1 where a cube is reserved. Rebuildable from the familiars' `cube` fields. */
  reserved: number[];
  groups: GroupState[];
  columns: number[][]; // queued group ids, front first
  slots: (number | null)[]; // authoritative: group id or null, length params.slots
  familiars: Familiar[];
  nextFamiliarId: number;
  deliveredTotal: number;
  cubesTotal: number;
}
```

All fields are numbers, strings, booleans, arrays and plain objects, so `structuredClone` and
`JSON.stringify` work. A group's slot is found from `slots` (it is the only record; `GroupState` has
no slot field).

### Derived caches (the per-colour accessible sets of GAME_DESIGN_V2 §4a)

They are **not** fields of `CollectState`. They live in a module-private `WeakMap<CollectState,
Caches>` behind `cachesOf(s)`, which builds them on first use from `grid`, `dist` and `reserved`
(O(cells)). Consequences, all required behaviour:

- Any state object that arrives without a cache (from `structuredClone`, `JSON.parse` +
  `fromJSON`, an undo snapshot, a replay) works; its first use rebuilds the cache.
- `cloneState` copies the cache (the solver clones constantly); `fromJSON(json)` validates the
  shape and **recomputes `dist` and `reserved`** from `grid` and the familiars, so the derived
  fields are never trusted from storage.
- `hashState` covers `params, tick, status, lossReason, grid, groups, columns, slots, familiars,
nextFamiliarId, deliveredTotal, cubesTotal`; it excludes `dist`, `reserved` and the caches.
  Soundness: nearest-first selection is a total order on `(distance, idx)`, so results never depend
  on set iteration order. Test: a state advanced through the incremental path hashes equal to the
  same state rebuilt through `JSON` + `fromJSON`, and its `dist` equals a fresh BFS.

## 3. Public API (what the renderer, solver and tests use)

```ts
createCollectState(level): CollectState
fromJSON(json: unknown): CollectState         // validates; recomputes dist/reserved
legalActions(s): Action[]                     // fronts by column, then waiting by slot (DIFFICULTY_V2 §2 order)
explain(s, a): ActionCheck                    // why an action is or is not allowed
apply(s, a): CollectEvent[]                   // throws IllegalActionError(reason) unless explain(s,a) === "ok"
step(s): CollectEvent[]                       // one tick (GAME_DESIGN_V2 §7); [] if settled or finished
runUntilSettled(s, maxTicks = 100_000): CollectEvent[]
isSettled(s): boolean
cloneState(s): CollectState
stateKey(s): string                           // solver identity (see below)
hashState(s): string                          // full logical hash (see §2)
replay(level, log, untilTick?): { state; events; batches }

type Action = { kind: "select"; column: number } | { kind: "resume"; slot: number }
type ActionCheck =
  | "ok"
  | "gameOver"          // status is won or lost
  | "unavailable"       // column out of range or empty, or slot empty / out of range
  | "fieldFull"         // fieldCap groups already working
  | "noReachableCube"   // the group has no assignable cube right now
type LogEntry = { tick: number; action: Action }
```

- `explain` is what the UI uses to show why a tap did nothing ("too many groups working", "no
  reachable cube of this colour yet"); `apply` throws a typed `IllegalActionError` carrying the
  same reason for anything but `"ok"`.
- `stateKey(s)` = per-column group counts, then the **waiting groups as `(colour, remaining)` pairs
  sorted ascending**, then the set of cubes that remain (bitset). It is only meaningful at a settled
  state and ignores tick, slot numbers, routes and timers (GAME_DESIGN_V2 §10).
- **Replay.** `LogEntry.tick` is the value of `state.tick` at the moment the action is applied,
  i.e. between steps (after the step that produced that tick, before the next). `replay` applies
  entries in log order, running `step` until `state.tick` equals the entry's tick, then `apply`. If
  the engine settles before reaching that tick (ticks do not advance when settled), or an entry is
  illegal, `replay` throws with the entry index. Entries at the same tick apply in log order.
  `untilTick` stops after the state's tick reaches that value (inclusive); without it replay runs to
  the end of the log and then to settled. `batches` is the per-tick event grouping
  `{tick, events}[]`.

### Session (`CollectSession`, M9.4) — the only object the renderer touches

```ts
class CollectSession {
  readonly level: CollectLevel;
  get state(): Readonly<CollectState>; // replaced (new object) on undo and restart
  get log(): readonly LogEntry[]; // effective action log; truncated by undo
  get canUndo(): boolean;
  tap(a: Action): { ok: boolean; reason: ActionCheck; events: CollectEvent[] };
  tick(): TickBatch | null; // null when settled/finished (no tick advanced)
  undo(): boolean; // restores the snapshot before the last action (cloneState)
  restart(): void;
  subscribe(listener: (batch: TickBatch) => void): () => void;
}
interface TickBatch {
  tick: number;
  events: CollectEvent[];
} // actions applied at a tick form their own batch
```

Snapshots are taken with `cloneState` before each action. Undo drops the last log entry.
`subscribe` delivers one `TickBatch` per `tick()` call, and one batch (with the tick at which they
happened) for the events of each applied action.

### Events

```ts
type CollectEvent =
  | { type: "groupSelected"; group: number; column: number }
  | { type: "groupResumed"; group: number; slot: number }
  | { type: "familiarSpawned"; familiar: number; group: number; routeLength: number }
  | { type: "cubeReserved"; familiar: number; cube: number } // after spawn, and on reassignment
  | { type: "familiarMoved"; familiar: number; from: number; to: number; carrying: boolean }
  | { type: "cubePickedUp"; familiar: number; cube: number; color: number }
  | { type: "cubeDelivered"; familiar: number; group: number; color: number; remaining: number }
  | { type: "familiarRetired"; familiar: number }
  | { type: "groupParked"; group: number; slot: number; remaining: number } // remaining > 0
  | { type: "slotReleased"; slot: number } // when a resumed group leaves its slot
  | { type: "groupCompleted"; group: number }
  | { type: "won" }
  | { type: "lost"; reason: "slotsFull" | "deadlock"; group: number | null }; // the group that ran dry
```

`routeLength` is the number of **moves** (`route.length − 1`; 0 when the standing cell is the portal).
`familiarSpawned` is always followed by `cubeReserved` for its target. Events carry padded indices.
Within a tick they appear in phase order and then in the iteration orders of GAME_DESIGN_V2 §7.
(`groupPartial` in earlier drafts is `groupParked` with `remaining > 0`.)

**Familiar positions for the renderer.** A `toCube`/`carrying` familiar that moved this tick goes
from `from` to `to` (from `familiarMoved`); the state already holds the new `at`. A `pickup`
familiar stands on `route[at]` (its standing cell), a `deliver` familiar on the portal
(`route[0]`), an `idle` familiar is at the portal for the instant before it is reassigned or retired.

## 4. Module layout

```
packages/core/src/collect/          (new; exported from core's index as the `collect` namespace)
  level.ts       CollectLevel, validateCollectLevel, parseCollectLevel
  grid.ts        padded grid helpers, neighbour order, dist init + incremental update, canonical descent
  state.ts       state types, createCollectState, fromJSON, cloneState, stateKey, hashState, cachesOf
  targeting.ts   accessible sets per colour, nearest-first target + standing cell, route
  actions.ts     explain, legalActions, apply
  sim.ts         step (phases 0–4), runUntilSettled, isSettled
  events.ts      CollectEvent, TickBatch
  session.ts     CollectSession, replay
  fixtures.ts + *.test.ts   (GAME_DESIGN_V2 §14 boards, R-03/R-05/R-08 boards)
  (solver.ts, strategies.ts, generator.ts arrive in M12)

packages/game/src/collect/          (new, M10; dynamically imported, see §6)
  CollectScene.ts, Choreographer.ts, CubeLayer.ts, FamiliarLayer.ts, PortalView.ts,
  SlotsView.ts, ColumnsView.ts, familiar art / atlas (M10.1)
```

Dependency order for building: `grid` → `level` → `state` → `targeting` → `actions` → `sim` →
`session`. `collect/` imports nothing from `packages/game`, Phaser or the DOM, and from v1 only
`rng` and `EMPTY`. v1 modules do not import `collect` (except the single export line in core's
index). **`collect/` must not edit `level.ts`, `track.ts`, `sim.ts`, `rng.ts`, `solver.ts`,
`generator.ts` or `art.ts` of v1**: `tools/levels/format.ts` hashes them into every shipped level's
`source`, so any edit would make all v1 levels stale.

## 5. Render ↔ simulation interface

- **The renderer drives the clock; the rules do not read time.** `Choreographer` keeps
  `tickClock += dt × ticksPerSecond × speed` and calls `session.tick()` once per whole tick, at most
  4 per frame. If the device cannot keep up, capping means **logical time runs slower than wall
  time**; ticks are never skipped or merged, so outcomes never change, and decorative effects are
  dropped first.
- **Interpolation.** A moving familiar is drawn from `from` to `to` with the fractional part of the
  tick clock as alpha. Pickup and deliver are one-tick animations. Carried cubes are drawn attached
  to their familiar from `cubePickedUp` until `cubeDelivered`.
- **Views are functions of state + events.** The cube layer removes a cube on `cubePickedUp`
  (it has left the board and is carried); the group badge number is `capacity − delivered` and
  changes on `cubeDelivered`; the slot row is rebuilt from `slots`; a familiar's colour is
  `groups[familiar.group].color`. Nothing in the game package mutates `CollectState` or `params`
  (`squad`, `spawnGap` and `fieldCap` are level constants and the renderer only receives
  `Readonly` state).
- **Speed.** `ticksPerSecond` is **24 at 1×** (set in M10.2 after watching a 20-cell board cross at 10 per second: too slow; further tuning in M10.3–M10.4); 2× doubles `speed`.
- **Reduced motion** removes decorative motion (trails, bobbing, shake) but keeps ticks and
  deliveries.
- **Input.** Tap targets are column fronts and filled slots. The scene calls `session.tap`; on
  `ok: false` it shows the `reason` text and nothing else happens.

## 6. Feature flag and rollout (audit risk R1: `main` auto-deploys)

The aim is that **no player of the shipped game sees any difference** before the switch (M15.5).
This needs a small, listed set of v1 edits, because the build, service worker and entry point are
shared:

1. **Flag.** `?engine=v2` on `/play/` (or `PUBLIC_ENGINE=v2` at build time for review builds)
   selects v2. In `packages/game/src/index.ts`, the flag branch loads `collect/CollectScene` with a
   dynamic `import()` (with a `.catch` for an offline or stale chunk) and, once the **scene manager**
   has booted (`game.scene.isBooted`, not `game.isBooted`, which is set earlier), stops the title and
   starts it. Without the
   flag the code path is unchanged. The existing DPR-change handler restarts every non-`play` scene
   and would restart the v2 scene mid-game, so that one `continue` is extended to the v2 scene key.
2. **Chunk name, location and budget (as built in M10.2).** The v2 scene is the lazily loaded
   `v2/CollectScene.js`: a **stable, unhashed name, outside `_astro/`**. (A hashed name is embedded
   in the play bundle that imports it, so every v2-only change would also change the shipped bundle
   and the service worker version; the first attempt, a hashed chunk in `_astro/`, did exactly that
   and was caught in review.) It is served `no-cache` (`/v2/*` in `public/_headers`, `location /v2/`
   in nginx, tested), is not part of "play page JS", and has its own line in `tools/perf/budget.ts`:
   **≤ 40 KB gzip** (13.5 KB when built). `tools/perf/check.ts` fails the build if the chunk is
   missing, moves into `_astro/`, or any play bundle references a hashed name. A build experiment is
   documented in `docs/V2_REVIEW_BUILD.md`: changing only v2 code leaves `play*.js` and `sw.js`
   byte-identical. The engine is imported from the `@hexhue/core/collect` subpath so it is not
   reachable through the barrel the shipped game uses; none of it is in the main bundle.
3. **Service worker.** It precaches only the shell (`play/index.html`, `_astro/*`, icons,
   manifest); `v2/` is outside that rule, so v1 players never download the chunk and a v2 deploy
   never changes the worker version (a test pins this). After the switch (M15.5) the chunk moves
   into the normal build and the special cases are removed.
4. **Core index.** One export line, `export * as collect from "./collect"`.
5. **Services.** The v2 scene may use audio, haptics, display and layout helpers. It does **not**
   write the save, award coins or progress, or send analytics until the switch (v2 progress is a
   throwaway session). `mountGame`'s existing save load and `app_open` event happen as for v1.

Everything else in v1 is untouched; any other v1 edit before M15.5 needs a stated reason in its PR.

## 7. Performance budget for collectors (audit risk R4)

| Item                  | Budget                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live familiar sprites | ≤ `squad × fieldCap` ≤ 36, pooled; no per-frame allocation in the sprite loop                                                                                                                                                            |
| Cube drawing          | One render texture; removal clears that cell, flushed once per frame; static board, outlines, HUD circles, badge backgrounds and the portal gate are baked textures (Graphics re-tessellates every frame: measured in `docs/V2_PERF.md`) |
| Per-tick simulation   | target ≤ 1 ms amortised on a mid-range phone for a 40×40 board (CPU measured on a desktop in M10.3, `docs/V2_PERF.md`; on a phone in M15.3)                                                                                              |
| Pathfinding           | Only on assignment, incremental `dist`; none per frame (GAME_DESIGN_V2 §4a)                                                                                                                                                              |
| Frame time            | target ≤ 16.6 ms (60 fps); to be measured on a mid-range Android in M15.3 (deferred from M10.3: no device was available; see `docs/V2_PERF.md`)                                                                                          |
| Texture memory        | One familiar atlas ≤ 512×512; colours by tint, no per-colour copies                                                                                                                                                                      |
| Download              | `collect` chunk ≤ 40 KB gzip (§6), enforced by the budget script                                                                                                                                                                         |

## 8. Vertical-slice content plan (the level built in M10.5)

**Subject:** a witch's cauldron over embers, with a bubbling potion: recognisable at a glance, and
its natural layering gives the dependency the rules need. (Final art direction and palette come from
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
`K = 3`, `squad = 3`, `spawnGap = 2`, `fieldCap = 3`. Group capacities are chosen so that at least one
violet and one green group have a capacity larger than what is accessible when they are first
selectable (they will wait), and each colour's capacity total equals its cube count.

**Strategic choices (at least three):** (a) clear violet before opening green, (b) which of two
violet groups to open first (the other may be buried behind green), (c) park a half-finished group
or open another, (d) when to resume a waiting group, (e) spend the third slot on the free gold group.

**Required sequences.** The slice level's group list, capacities and the two action logs (one
winning, one losing in `slotsFull`) are **M10.5 deliverables**; they cannot be written before the
art exists. What is fixed now is how they are validated and what the engine must already prove:

- _Proof on a small board (M9.5 fixtures, from GAME_DESIGN_V2 §14 fixture B, hand-traced here)._
  Board 5×4, `P = (2,4)`, `K = 1`, `squad = 3`, `spawnGap = 2`, columns `[R:2] [G:2] [B:16]`:

  | Line | Log (tick → action)                                                                                 | Checked outcome                                                                                                                    |
  | ---- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
  | L    | `0 → select col 0`, `5 → select col 1`                                                              | R:2 parks in slot 0 (remaining 1) at tick 5; G:2 runs dry at tick 10: **lost, `slotsFull`, group 1**                               |
  | W1   | `0 → select col 0`, `5 → select col 2`, then `resume slot 0` and `select col 1` at the settle ticks | R parks at tick 5; later ticks are recorded when M9.1 first produces them and cross-checked by an independent implementation (§10) |
  | W2   | `0 → select col 2`, then `select col 0`, `select col 1` at the settle ticks                         | slots never used; won                                                                                                              |

  Tick trace of L: tick 1 spawns f0 for `(1,3)` (standing cell `(1,4)`); tick 2 moves there; tick 3
  picks up; tick 4 returns to `P`; tick 5 delivers, retires, and R:2 parks. `select col 1` at tick 5;
  tick 6 spawns g0 for `(3,3)` (standing cell `(3,4)`); ticks 7–9 as above; tick 10 delivers and G:2
  finds no assignable green and no free slot.

- _Validation of the slice level (M10.5)._ An exhaustive search of the settled-sequential tree,
  **memoised on `stateKey`** (≤ 13 groups keeps it small), must find (i) at least two winning lines
  with different parking signatures and (ii) a reachable `slotsFull` loss, and the two demo logs
  run headlessly to their stated outcomes. The nine players, `recoveryDepth` and the other bands of
  `DIFFICULTY_V2` need the solver (M12.1) and players (M12.3); the slice is measured against them
  retroactively in M12.4 as calibration data and does not gate M10.5. The human is asked about feel
  (gate G1), not about the numbers.

## 9. Rule → module → task → test

Task ownership by module: **M9.1** `level`, `grid`, `state` (groups present, minimal), `targeting`,
`sim` phases 0–2 and `apply(select)`, `events` types (emitted from the start); **M9.2** group
bookkeeping and conservation in `state`/`sim` Phase 3 completion; **M9.3** slots, parking,
`resume`, `fieldCap`, loss rules in `actions`/`sim`; **M9.4** `session`, `replay`, event-order
snapshots, undo; **M9.5** the full test sweep and fixtures.

| GAME_DESIGN_V2 rule / edge case                              | Module                 | Tests                                                              |
| ------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------ |
| §3 level validity, group ids, `portalX` and limits           | `level.ts`             | M9.1: validation cases, R-20, ids in level order                   |
| §4 reachable set, accessible cubes, pockets (R-01…R-05)      | `grid.ts`              | M9.1/M9.5: boards R-03, R-05, fixture D; incremental = fresh BFS   |
| §4 targeting, ties, canonical descent (R-11, R-17)           | `targeting.ts`         | M9.1: fixtures A and C                                             |
| R-06 same-colour familiars, R-15 capacity binding            | `targeting.ts`/`sim`   | M9.1/M9.2: fixture C with squad 3                                  |
| §5 capacity bookkeeping, R-18 identity, R-14 parking         | `state.ts`, `sim.ts`   | M9.2: conservation property test, purple-12/7, identity every tick |
| §6 legality, `explain` reasons, lowest free slot             | `actions.ts`           | M9.3: fieldCap, noReachableCube (fixture D), gameOver, unavailable |
| DIFFICULTY_V2 §2 `legalActions` order                        | `actions.ts`           | M9.3: ordering snapshot                                            |
| §7 phases 0–4, `nextSpawn`, ids, R-12                        | `sim.ts`               | M9.1: fixture A tick table; spawn-gap cases; R-12                  |
| R-08 same-tick pickups, R-09 same-tick exposure, R-10 chains | `sim.ts`, `grid.ts`    | M9.1/M9.5: board R-08, fixture E tick 2, fixture B chain           |
| R-07, R-13 reservation order and stalls                      | `sim.ts`               | M9.5: fixture E                                                    |
| §7 Phase 3 `slotsFull`, §8 `deadlock`, win on delivery       | `sim.ts`               | M9.3: fixture B line L (ticks above), deadlock board, win ordering |
| R-16 thin boards, R-19 reservation integrity                 | `grid.ts`, `sim.ts`    | M9.1: `W=1` column; assertion test                                 |
| §9 concurrency, same-tick action order                       | `sim.ts`, `session.ts` | M9.5: fixture E, two selects at one tick                           |
| §10 `stateKey`, settled replay equality                      | `state.ts`             | M9.5 → M12.1: solver line replays tick for tick                    |
| §11 determinism, events, replay, undo                        | `session.ts`           | M9.4: replay hash tests, event-order snapshots, undo truncation    |
| Derived caches rebuild; JSON round trip hash                 | `state.ts`             | M9.1: structuredClone/JSON/undo snapshot all rebuild; hash equal   |
| Renderer never changes `params`                              | `packages/game`        | M10.2: state is passed `Readonly`; lint/type test                  |
| v1 untouched: SW exclusion, flag off = unchanged             | `serviceWorker`, entry | M10.1: SW test; budget line                                        |

## 10. What this design does and does not show

| Question              | Evidence now                                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do the docs agree?    | GAME_DESIGN_V2 went through two review rounds (round two checked it with a throwaway implementation that is **not** committed); this spec adds types, API, layout and rollout and was reviewed once, with its gaps fixed.                                                         |
| Implementable?        | Types, API, index formula, cache mechanism, replay semantics, events and fixtures are written down; remaining open details are in §11.                                                                                                                                            |
| Deterministic?        | No clock or RNG in the rules; iteration orders and ties are fixed; `dist` is canonical; ids are counters.                                                                                                                                                                         |
| Testable?             | §9 maps each rule and edge case to a test task; the fixtures are written down. Fixtures A, B (line L) and E were traced by hand in review. An executable cross-check is an M9.5 deliverable (independent implementation or property test of the rules), not an existing artefact. |
| Losing sequence real? | Fixture B line L: R:2 parks, G:2 runs dry with all slots full → `slotsFull` (tick-stamped above).                                                                                                                                                                                 |
| `main` safe?          | §6 lists every v1 edit and the budget/SW handling.                                                                                                                                                                                                                                |
| Is it fun?            | **Unknown** until a person plays the slice (gate G1). Bands are provisional; performance numbers are targets.                                                                                                                                                                     |

## 11. Details deliberately left to later tasks

- Exact wiring of the flag in `BootScene`/`mountGame` (M10.2), within §6's limits.
- Tick-stamped logs for the full slice level and for lines W1/W2 beyond tick 5 (M9.5/M10.5).
- Final `ticksPerSecond`, pickup/deliver animation lengths, trail and sound design (M10.3–M10.4).
- Boosters (M14.4), save format for v2 progress (M15.5), analytics events (M14.5).

## 12. Risks carried into M9/M10

- **Solver cost** with `squad`/`fieldCap` in the transition function (settled model keeps it
  tractable; measured in M12.1).
- **Feel of nearest-first targeting** (passive vs. satisfying); the demo run is how it gets judged.
- **Visual clarity** of many familiars carrying cubes at 320 px width; M10.1/M10.3 test it early.
- **Bundle size** of the `collect` chunk against its own 40 KB line (§6).
