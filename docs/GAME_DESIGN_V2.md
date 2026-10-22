# Hex & Hue: Magic Pixel Puzzle — Game Design Spec v2

_A Little Magic in Every Color._

**Status:** v2.0.0 rules (roadmap M8–M15). Written in M8.2. The rules below are frozen except where
a later task is named as completing them: reachability edge cases and cost (M8.3), difficulty bands
(M8.4) and the level data model (M8.5). This is the source of truth for the v2 engine
(`packages/core/src/collect/`). `docs/GAME_DESIGN.md` describes the shipped v1 track mechanic and
stays until the v2 switch (M15.5).

The engine must implement exactly these rules, deterministically, so that the solver, the renderer
and a replayed action log all see the same game. Why v2 exists: `docs/V2_GAMEPLAY_AUDIT.md`.

## 1. The game in one paragraph

A dense pixel-art picture is built from coloured **cubes**. Beneath it, **columns** of numbered
**summon groups** wait; only the front group of each column can be chosen. Choosing a group sends its
colour of **familiars** (magical collectors) out of the **portal**. They head for cubes of their
colour that they can physically reach, pick one up, carry it back and drop it through the portal.
Only a delivered cube counts. The number on a group is how many cubes it can still deliver. Cubes
that sit behind other colours cannot be reached until those are cleared, so a group may run out of
reachable cubes with capacity left: it then **waits in a holding slot**. Slots are limited. Clear the
whole picture to win; if a group runs dry while every slot is full, or nothing left can reach the
remaining cubes, you lose.

```
              ┌──────────── pixel-art mosaic (W×H cubes) ────────────┐
              │  ▓▓▓▓▓ ▒▒▒▒▒ ░░░░░                                    │   open space (ring +
              │  ▓▓▓▓▓ ▒▒▒▒▒ ░░░░░    cubes block; emptied cells open │   emptied cells) is
              └───────────────────────────┬───────────────────────────┘   where familiars walk
                                          ◉ portal
        holding slots (K):   [ 7 🟣 ]  [ 9 🔵 ]  [  free  ]  [  free  ]  [  free  ]
        summon columns:      [12🟣]  [ 8🔵]  [20🟡]      ← only the front group of a column is tappable
                             [ 6🔵]  [14🟣]  [ 5🔴]
```

## 2. Terms

| Term            | Meaning                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cube            | One coloured cell of the mosaic. It leaves the board when a familiar picks it up and **counts only when delivered**.                |
| Carried         | A cube a familiar has picked up and not yet delivered. It is on neither the board nor the delivered count.                          |
| Open space      | The empty margin ring around the mosaic plus every emptied mosaic cell. Familiars walk only here.                                   |
| Portal          | A margin cell (default: directly below the bottom row, centred). Familiars start and end here; deliveries happen here.              |
| Reachable       | A cell is reachable if it is open space connected to the portal through open space (4-neighbour).                                   |
| Accessible cube | A cube with at least one reachable 4-neighbour. Hidden cubes (behind other cubes, or in sealed pockets) are not accessible.         |
| Group           | A colour and a **capacity** `n ≥ 1`, constant for the level. Its **remaining** number is `n − delivered`; that is the number shown. |
| Column          | An ordered stack of groups. `columns[c][0]` is the front; only fronts can be chosen.                                                |
| Field           | Where `working` groups are. At most `fieldCap` groups work at once.                                                                 |
| Slot            | One of `K` holding seats for `waiting` groups.                                                                                      |
| Familiar        | A collector belonging to one group. Walks, picks up, carries, delivers. It has no capacity of its own.                              |
| Squad           | The most familiars one group has out at once (`squad`).                                                                             |
| Assignable cube | An accessible, unreserved cube of a group's colour.                                                                                 |
| Reserved        | A cube a familiar has been sent to fetch (until it is picked up). No other familiar may target it.                                  |
| Tick            | One discrete simulation step (§7). A familiar that exists at the start of a tick performs one action in Phase 1.                    |
| Settled         | No familiar exists **and** no group is `working`. Every opened group is then completed or waiting.                                  |

Familiars are the actors; the collectors are original creatures (M10.1). See §17 for the content rule.

## 3. Level data

A level is: `width`, `height`, `palette`, `cells` (palette index or `EMPTY`, row-major, `y = 0` top),
`columns: {color, capacity}[][]`, `slots K`, `squad`, `spawnGap`, `fieldCap`, optional `portalX`.

- `squad`, `spawnGap` and `fieldCap` are part of the **level**, fixed per level, and part of the
  rules the solver uses. They are not device or speed settings and the renderer must never change
  them (they influence which cubes a capacity-bound group takes, §14 fixture C).
- Every colour's total group capacity equals its cube count, so nothing is over- or under-collected.
- At least one group exists; `1 ≤ K ≤ 8`; `squad ≥ 1`; `spawnGap ≥ 1`; `fieldCap ≥ 1`.
- **Group ids** are `0..n−1` in level order: `columns[0]` front to back, then `columns[1]` front to back, and so on. Every rule that says "ascending group id" uses this numbering.
- The level has a **settled-sequential solution** (§10), stored with it and verified by the solver.
- `portalX` must be in `[0, W−1]`; the portal is `(portalX, H)`, a ring cell, never a mosaic cell.

The exact serialisation and module layout are fixed in M8.5.

## 4. Open space and reachability

Coordinates are mosaic coordinates `(x, y)` with `0 ≤ x < W`, `0 ≤ y < H`. The **margin ring** is
every cell with `x ∈ [-1, W]`, `y ∈ [-1, H]` outside the mosaic. A cell is **open** when it is in the
ring or is a mosaic cell with no cube. The ring is a connected loop (also for `W = 1` or `H = 1`), so
the portal is always connected to the whole ring.

- **Reachable set** `R` = open cells connected to the portal by 4-neighbour moves through open cells.
  Because cubes are only ever removed, `R` only grows.
- A cube is **accessible** if any of its 4 neighbours is in `R`.
- A familiar's **standing cell** for a cube is a neighbour of the cube that is in `R`. Pickup happens
  from there; the familiar never enters the cube's cell until the cube is gone.
- Hidden cubes are never collected remotely: access needs a clear neighbour, never a line of sight.
- Sealed pockets (empty cells enclosed by cubes, not connected to the ring) are **not** in `R`; cubes
  that only touch a sealed pocket are not accessible. They become accessible when a neighbouring
  cube is removed and the pocket joins `R` (fixture D).

The edge-case table, algorithm and cost budget are in §4a.

**Targeting.** For a group of colour `c` the **assignable cubes** are the accessible, unreserved cubes
of colour `c`. The **distance** of a cube is the smallest BFS distance from the portal to any of its
reachable neighbours (BFS over `R`, expanding neighbours in the fixed order **up, left, right,
down**). A group's next target is the assignable cube with the smallest distance; ties go to the
smaller `y`, then the smaller `x`. Its standing cell is its nearest reachable neighbour (ties:
smaller `y`, then smaller `x`). The walking route is found by **canonical descent**: starting at the
standing cell, repeatedly step to the neighbour whose distance is one smaller, trying neighbours in
the order up, left, right, down, until the portal; the route is that path reversed. It depends only
on the distance map, so any way of computing distances gives the same route. Routes are stored when
assigned and stay valid forever because `R` only grows; the way back is the same route reversed.

## 4a. Reachability: algorithm, edge cases, cost (M8.3)

### Algorithm

Work on the padded grid `(W+2) × (H+2)` (mosaic plus ring). State kept by the engine:

- `cube[cell]`: colour index or none (board).
- `dist[cell]`: shortest 4-neighbour walking distance from the portal through open cells, or `∞` if
  the cell is not in `R`. This is the **canonical distance map**; it is a pure function of which
  cells are open.
- For each colour, the set of **accessible cubes** (cubes with at least one neighbour with finite
  `dist`), and a `reserved` flag per cube.

`dist` is initialised by one BFS from the portal over open cells. It is updated at the end of
Phase 1 (§7) after pickups. Cells only open, so distances only decrease or go from `∞` to finite:

1. For each cube removed this tick, its cell becomes open. It is adjacent to its familiar's standing
   cell, so it always has a finite-`dist` neighbour and joins `R`.
2. Relax: set `dist[c] = 1 + min(dist of open neighbours)` and propagate any decrease outward with a
   queue (standard incremental BFS). A sealed pocket that touches the new cell is absorbed by the
   same propagation (its cells go from `∞` to finite).
3. Every cube neighbouring a cell whose `dist` just became finite is added to its colour's accessible
   set.

This yields exactly the same `dist` as recomputing a fresh BFS (the engine's tests must assert equality
after every tick on random boards), so incremental and full implementations agree; the route is
derived by canonical descent (§4), never from stored parent pointers.

**Choosing a target** for a group of colour `c` scans only the accessible set of `c`: for each
unreserved cube, `d = min dist` over its neighbours; the choice is the minimum `(d, y, x)`. Its
standing cell is the neighbour with that `d`, smallest `(y, x)`.

### Cost budget

| Quantity                       | Bound at 40×40 (1,764 padded cells)             | Notes                                                     |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------------------- |
| Initial BFS                    | ≤ 1,764 cell visits, once per level start/reset | Also once per solver root.                                |
| Distance update per pickup     | amortised O(changed cells), worst case 1,764    | Only decreases propagate.                                 |
| Target selection               | O(accessible cubes of that colour) ≈ perimeter  | Typically ≤ 150; never scans the whole board.             |
| Route reconstruction           | O(route length) ≤ 1,764                         | Once per assignment.                                      |
| Per-frame work in the renderer | none                                            | Renderer follows stored routes; no pathfinding per frame. |

Targets to meet (checked as tests/benchmarks in M9.5 and M12.1, not CI-flaky timings): a complete
settled run of one group over a 40×40 board with 1,000 cubes of its colour allocates no per-tick
arrays proportional to the board, and the solver can evaluate several thousand settled transitions
per second on a development laptop.

### Edge cases (each is a test in M9.5; ids are stable)

| Id   | Situation                                                                      | Rule / expected outcome                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | Cube on the mosaic edge                                                        | Accessible at the start: its outer neighbour is a ring cell in `R`.                                                                                     |
| R-02 | Cube with only cube neighbours                                                 | Not accessible. Cannot be assigned, however close its colour group is.                                                                                  |
| R-03 | Empty cell inside the picture connected to the ring by a 4-neighbour path      | Open from the start and part of `R`; cubes touching it are accessible.                                                                                  |
| R-04 | Empty cell enclosed by cubes (sealed pocket), fixture D                        | Not in `R`. Cubes touching only it are not accessible. When a neighbouring cube is removed the pocket joins `R` in the same update, exposing its cubes. |
| R-05 | Empty cell connected to the ring only diagonally                               | Not connected (4-neighbour moves only): treated as a sealed pocket.                                                                                     |
| R-06 | Two familiars, same colour, same group                                         | They hold different reservations; each cube has at most one reserver. They may stand on the same cell and overlap; nobody blocks anybody.               |
| R-07 | Two groups of the same colour, one assignable cube (fixture E)                 | The lower group id reserves in Phase 2; the other finds none and, with no familiar, stalls in Phase 3.                                                  |
| R-08 | Two pickups in the same tick                                                   | Both cubes are removed in familiar-id order; `dist` is updated once at the end of Phase 1; Phase 2 of that tick already sees both removals.             |
| R-09 | A cube becomes accessible while a familiar of another group is carrying        | Nothing happens to the carrier (its route and cube are fixed). The cube becomes assignable from the next Phase 2 on.                                    |
| R-10 | A cube becomes accessible only after two different pickups (needs both)        | Never assignable earlier: access needs a reachable neighbour, and both openings are needed to connect the cell to `R`.                                  |
| R-11 | Shorter route appears after a reservation                                      | The old route is kept; later assignments use the new distances. A route never becomes invalid because cells never close.                                |
| R-12 | Standing cell is the portal (route length 0)                                   | Familiar spawns in `pickup`, then goes `pickup → deliver` (§7); two ticks from spawn to delivery.                                                       |
| R-13 | Group's colour has accessible cubes, all reserved by others                    | Not assignable. If the group has no familiar it stalls; if it has familiars out, it waits for them (they may free nothing, but it stays `working`).     |
| R-14 | Group has uncommitted capacity but all its colour's remaining cubes are hidden | Stalls and parks with remaining capacity exact (§5). Resumable only when an assignable cube exists.                                                     |
| R-15 | Capacity runs out before accessible cubes do                                   | Extra accessible cubes stay; they belong to other groups by the §3 invariant. Which ones are taken is decided by nearest-first (fixture C).             |
| R-16 | Board one cell wide or high                                                    | Every cube touches the ring; all cubes are accessible from the start. The portal column must still be inside `[0, W−1]`.                                |
| R-17 | Tie in distance between cubes or standing cells                                | Smaller `y`, then smaller `x` (§4). Never insertion order or hash order.                                                                                |
| R-18 | Group colour with zero cubes left but capacity left                            | Impossible by the §3 invariant unless a cube was lost; the engine asserts it (a bug, not a game state).                                                 |
| R-19 | Familiar reaches its standing cell and the cube is gone                        | Impossible: only the reserving familiar can remove a reserved cube. The engine asserts it.                                                              |
| R-20 | Level start has no accessible cube for any front group                         | Invalid level (no legal first action): the level pipeline rejects it.                                                                                   |

### Why no remote or "through other colours" pickup

Eligibility is "has a 4-neighbour in `R`", a property of the board, never a ray or a straight line.
A familiar must be able to walk to a neighbouring cell, so a cube behind another cube (of any colour)
is unreachable until the blockers go. Removing an outer cube always opens exactly the cell it
occupied, which is how interior cubes get exposed.

## 5. Groups, columns, field and slots

| State       | Where   | Meaning                                                                                        |
| ----------- | ------- | ---------------------------------------------------------------------------------------------- |
| `queued`    | column  | Waiting its turn. Selectable only when it is the column front.                                 |
| `working`   | field   | Has familiars out or can send them: capacity left and an assignable cube exists.               |
| `waiting`   | a slot  | Capacity left, but no familiar out and no assignable cube. Sleeps until the player resumes it. |
| `completed` | nowhere | Delivered its whole capacity.                                                                  |

Only groups that **cannot finish** occupy a holding slot: a working group that runs out of assignable
cubes with capacity left moves to the lowest-numbered free slot and becomes `waiting`. A group that
finishes never uses one.

Per-group bookkeeping, at all times (capacity is constant; `delivered` is cumulative across resumes):

```
capacity = delivered + committed + uncommitted        shown number = capacity − delivered
```

`committed` is the number of cubes currently reserved or carried by the group's familiars. A group
never commits more than its uncommitted capacity, so it can neither over-collect nor leave a phantom
familiar, and the shown number drops only on delivery. Leftover capacity is kept exactly: a purple
12 that can reach only 7 purple cubes delivers 7, turns `waiting` showing **5**, and may be resumed
later to deliver the other 5.

## 6. Player actions

There is no timer. Actions happen between ticks.

1. **Select** a column front. Legal only if fewer than `fieldCap` groups are `working` and the group
   has at least one assignable cube. The group leaves its column (the next group becomes the front)
   and becomes `working`; `nextSpawn = tick + 1`.
2. **Resume** a `waiting` group (tap it in its slot). Legal under the same two conditions. It leaves
   its slot (freeing it) and becomes `working`; `nextSpawn = tick + 1`.
3. **Boosters** (Undo, extra slot, …) are defined in M14.4; Undo restores the state before the last
   select/resume.

Illegal taps do nothing to the game (the UI explains why: "no reachable cube of this colour yet", or
"too many groups working"). They never cost anything.

## 7. The tick

State changes only through `select`/`resume` and `step`. `tick` starts at 0. One `step` runs the
phases below in order; all iteration orders are part of the rules.

**Phase 0 — begin.** If the game is won or lost, or the state is settled, `step` does nothing and
returns no events (a no-op does not advance `tick`). Otherwise `tick += 1`.

**Phase 1 — act.** Each familiar, in ascending familiar id, performs its single action:

| Familiar state | Action this tick                                                                          | Next state                                          |
| -------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `toCube`       | Move one cell along its route.                                                            | `pickup` if it is now on its standing cell          |
| `pickup`       | Remove the reserved cube from the board (its cell becomes open). The cube is now carried. | `deliver` if the route length is 0, else `carrying` |
| `carrying`     | Move one cell back along its route.                                                       | `deliver` if it is now at the portal                |
| `deliver`      | `delivered += 1`, `committed −= 1`; the cube counts as collected.                         | `idle`                                              |

A familiar spawned or assigned with a route of length 0 starts in `pickup`. Removals during Phase 1
are applied in familiar-id order, but `R` is recomputed once at the end of the phase, so two pickups
in one tick never expose a cube to each other's decisions that tick.

**Phase 2 — dispatch.** For each `working` group in ascending group id (group id, §3):

1. Each `idle` familiar of the group, in id order: if the group has uncommitted capacity and an
   assignable cube, it takes the next target (§4), reserves it and becomes `toCube` (or `pickup` for
   a route of length 0). Otherwise it **retires** into the portal and is removed.
2. **At most one spawn per group per tick:** if `tick ≥ nextSpawn`, the group has fewer than `squad`
   familiars, uncommitted capacity and an assignable cube, spawn a familiar at the portal with that
   target and set `nextSpawn = tick + spawnGap`.

Familiar ids come from one global counter in the state, increasing by one per spawn and never
reused; the counter is part of the serialised state.

**Phase 3 — resolve.** Two passes over the `working` groups, each in ascending group id:

1. **Complete:** `delivered = capacity` → `completed`; it leaves the field. (Completing never frees a
   slot.)
2. **Stall:** a group with no familiar and no assignable cube **stalls**, also called _parking_: it
   moves to the lowest free slot and becomes `waiting`. If **no slot is free the game is lost**
   (reason `slotsFull`); the pass stops there and the state is frozen (groups after it in this pass
   are left as they were).

**Phase 4 — status.** If total delivered equals the number of cubes the level started with: **won**.
Otherwise, if the state is settled (no familiar, no `working` group) and no legal action exists
(§8): **lost** (reason `deadlock`). Win and loss are functions of the logical state only; they are
never decided by animation, frame rate or timing. Win is tested first.

## 8. Win and lose

- **Won:** every cube has been **delivered** (none on the board, none carried). By the capacity
  invariant every group is then completed.
- **Lost, `slotsFull`:** a working group runs out of assignable cubes with capacity left and all `K`
  slots hold waiting groups. The cause the player can read off the screen is "my slots were full when
  the group ran dry".
- **Lost, `deadlock`:** settled, cubes remain, and no legal action exists: no queued front and no
  waiting group has an assignable cube. Nothing can ever change again.
- From a **settled** state every legal action delivers at least one cube (it needs an assignable cube
  and nothing else is working), and the delivered total only grows, so settled play always ends. In
  concurrent play a legal action can park without delivering (fixture E); the game still cannot run
  on by itself, because ticks only run while familiars or working groups exist, and each is finite.
- Apart from `slotsFull` (§16 Q1), the game does not declare a loss early for positions that are
  merely doomed but still have legal moves; an optional "doomed" hint (M14) may use the solver.

Undo and boosters can recover from a loss (M14.4). Retry is always free and instant.

## 9. Concurrency

The player may select another group while others are still working, up to `fieldCap` at once. Their
familiars share the open space and never block each other (they may overlap). Because the tick
rules fix every ordering, the result of a given **action log** (a list of `(tick, action)`) is
unique. Speed (1× or 2×) changes only how many ticks are shown per second; the same log gives the
same outcome at either speed (a human tapping at the same _visual_ moment at different speeds taps at
different ticks, which is a different log). Actions logged at the same tick apply in log order.

Whether a group needs a manual resume depends on timing in concurrent play: if another group's pickup
exposes a cube for a group that already stalled, that group is `waiting` and must be resumed; if it
still had a familiar out, it carries on by itself. Waiting between taps (settled play) always gives
the same, predictable result. Concurrency is a convenience and a risk, not an advantage the solver
relies on: opening several groups at once can strand more slots than waiting would.

## 10. Settled play and the solvability guarantee

A player may always wait until the board is settled before choosing again. The **settled-sequential
model** is exactly that: from a settled state the only moves are "select a legal front" or "resume a
legal waiting group", followed by `step` until settled or the game ends. The solver searches this
model; branches that end in a loss are pruned.

- A level is valid iff the settled-sequential model has a winning line, stored with the level.
- A winning line in this model is always playable in the real game (just wait between taps).
- Solver state identity at a settled state: for each column its group count; the set (unordered) of
  waiting groups as (colour, remaining capacity) pairs; which cubes remain. Tick, route data and spawn timers
  carry no information at a settled state (there are no familiars and no working groups; timers are
  reset on select/resume); slot numbers do not matter in settled play.
- Because the outcome of running groups to settled is a deterministic function of the board and the
  level constants (§3, §4, §7), the solver uses the real engine as its transition function, so a
  solver line replays in the live engine tick for tick. There is no separate "solver model" to drift.

## 11. Determinism and replay

- Seeded RNG only, and only for level generation and cosmetic effects; the simulation itself has no
  randomness at all. No `Date.now()` / `Math.random()` in `packages/core`.
- State is plain serialisable data. The renderer interpolates familiars between ticks and never
  mutates state.
- Events (M9.4): `groupSelected`, `groupResumed`, `familiarSpawned`, `familiarMoved`,
  `cubeReserved`, `cubePickedUp`, `cubeDelivered`, `groupPartial` (capacity left), `groupParked`,
  `slotReleased`, `groupCompleted`, `won`, `lost`.
- Replaying an action log from the level start reproduces the same state and event sequence.

## 12. Difficulty levers (bands set in M8.4)

Number of colours and groups · group capacities versus exposed cubes (how often a group must wait) ·
column ordering (a needed group buried behind one that is not useful yet) · hidden-colour
dependencies (colour A can only be cleared once B is gone) · fewer slots `K`. `squad`, `spawnGap` and
`fieldCap` are level constants and also affect which cubes a capacity-bound group takes. **Never** a
timer and never artificially slow movement.

## 13. Speed, rewards, boosters

- 1× is always free. 2× is a presentation speed that unlocks for the current level only through an
  optional rewarded ad (M14.3); with no working ad provider it is not offered. It never changes
  outcomes.
- Boosters are re-specified for this model in M14.4 and must each have a tested effect. Retry is
  always free; there are no lives, energy or forced ads.

## 14. Worked examples (fixtures for M9.5)

Coordinates are `(x, y)`, `P` is the portal. Group notation `R:2` is colour R with capacity 2. Unless
stated, `squad = 3`, `spawnGap = 2`, `fieldCap = 3`.

### A. One familiar, tick by tick

Board `W=3, H=1`, cubes `R R R` at `(0,0) (1,0) (2,0)`. `P = (1, 1)`. Columns: `[R:2]`, `[R:1]`.
`K=2`, `squad=1`, `spawnGap=1`. Action: `select` column 0 at tick 0.

| Tick | Phase | What happens                                                                                                                                                                                                                                                  |
| ---- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | —     | `select`: R:2 is `working`, `nextSpawn = 1`. Cubes on board 3, delivered 0.                                                                                                                                                                                   |
| 1    | 2     | Assignable: all three. Distances: `(1,0)` has neighbour `P` at 0; `(0,0)`, `(2,0)` at 1. Target `(1,0)`, route length 0. Spawn f0 in `pickup`; committed 1; `nextSpawn = 2`.                                                                                  |
| 2    | 1     | f0 picks up `(1,0)`: board has 2 cubes, `(1,0)` is open. Route length 0 → f0 `deliver`.                                                                                                                                                                       |
| 3    | 1     | f0 delivers: delivered 1 (shown number 1), committed 0, f0 `idle`.                                                                                                                                                                                            |
| 3    | 2     | f0 is idle with uncommitted 1. Assignable `(0,0)`, `(2,0)`, distance 1 each; tie → smaller `x`: target `(0,0)`. Its neighbours `(1,0)` (just vacated) and `(0,1)` are both at distance 1; tie → smaller `y`: standing cell `(1,0)`. f0 `toCube`, committed 1. |
| 4    | 1     | f0 moves `P → (1,0)`; now on its standing cell → `pickup`.                                                                                                                                                                                                    |
| 5    | 1     | f0 picks up `(0,0)`: board has 1 cube. Route length 1 → `carrying`.                                                                                                                                                                                           |
| 6    | 1     | f0 moves `(1,0) → P` → `deliver`.                                                                                                                                                                                                                             |
| 7    | 1     | f0 delivers: delivered 2 (shown 0), committed 0, `idle`.                                                                                                                                                                                                      |
| 7    | 2     | Uncommitted 0: f0 retires.                                                                                                                                                                                                                                    |
| 7    | 3     | delivered = capacity: R:2 `completed`. Slots untouched (it never stalled).                                                                                                                                                                                    |
| 7    | 4     | Delivered total 2 of 3: not won. Settled; legal action: select `R:1` (assignable `(2,0)`). Not lost.                                                                                                                                                          |

Then `select` column 1 finishes the level the same way: **won** when its delivery lands.

### B. Two ways to win and one way to lose (parking, resume, overflow)

Board `W=5, H=4`, `P = (2, 4)`. `K = 1`, `fieldCap = 3`, `squad = 3`, `spawnGap = 2`.

```
y0:  B B B B B
y1:  B R B G B     red (1,1) and green (3,1) are sealed in by blue
y2:  B B B B B
y3:  B R B G B     red (1,3) and green (3,3) touch the bottom ring: accessible
```

16 blue, 2 red, 2 green. Columns: `[R:2]`, `[G:2]`, `[B:16]`.
(Checked: initially exactly one red and one green are accessible; clearing blue exposes both hidden
cubes.)

| Line | Actions (each run to settled)             | Settled result after each action                                                                        |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1    | `select R:2`                              | Delivers `(1,3)`, stalls: **waiting in slot 0, shown 1**. Slots used 1/1.                               |
|      | `select B:16`                             | Legal (no seat needed). Delivers all 16 blue; completes. Reds and greens are all accessible.            |
|      | `resume slot 0` (R)                       | Delivers `(1,1)`; R completes; slot 0 free.                                                             |
|      | `select G:2`                              | Delivers both greens; completes. **Won.**                                                               |
| 2    | `select B:16`, `select R:2`, `select G:2` | Blue first: slots never used. **Won.**                                                                  |
| 3    | `select R:2`                              | As in line 1: R waits in slot 0.                                                                        |
|      | `select G:2`                              | Delivers `(3,3)`; no further assignable green; all `K = 1` slots are occupied → **lost (`slotsFull`).** |

The explanation a player can give for line 3: "both reds and greens were buried under blue; I let two
groups run dry with only one slot." Lines 1 and 2 are two different winning solutions.

### C. Capacity binding decides which cubes are taken

Board `W=5, H=1`, all five cubes purple at `(0..4, 0)`; `P = (2, 1)`. Columns `[P:3]`, `[P:2]`;
`K = 2`, `squad = 1`, `spawnGap = 1`. Action: `select P:3`.

| Delivery order of `P:3` | Cube    | Why (nearest-first, §4)                                                             |
| ----------------------- | ------- | ----------------------------------------------------------------------------------- |
| 1                       | `(2,0)` | Distance 0 (touches `P`).                                                           |
| 2                       | `(1,0)` | Distance 1 via `(1,1)` or the vacated `(2,0)`; ties with `(3,0)`, smaller `x` wins. |
| 3                       | `(3,0)` | Distance 1; `(0,0)` and `(4,0)` are at 2.                                           |

`P:3` completes. `(0,0)` and `(4,0)` are left for `P:2`, which then delivers them. With `squad = 3`
the same board gives the same three cubes only by coincidence of geometry; in general squad and
`spawnGap` can change which capacity-bound cubes are taken, which is why they are level constants.

### D. Sealed pocket and an illegal tap

Board `W=5, H=3`:

```
y0:  X X X X X
y1:  X . Y . X     the empty cells (1,1) and (3,1) are sealed pockets
y2:  X X X X X
```

12 X, 1 Y. Columns `[Y:1]`, `[X:12]`. `K = 1`.

| Step | Action        | Result                                                                                                                                    |
| ---- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `select Y:1`  | **Illegal** (no assignable Y: its only open neighbours are in sealed pockets). Nothing changes, no cost.                                  |
| 2    | `select X:12` | Delivers all 12; as soon as `(1,0)` (or any neighbour of a pocket) is removed the pocket joins `R` and Y becomes accessible. X completes. |
| 3    | `select Y:1`  | Legal now; delivers `(2,1)`. **Won.**                                                                                                     |

### E. Two groups of one colour, one accessible cube (reservation and parking)

Board `W=3, H=3`, `P = (1, 3)`, `K = 1`, `squad = 3`, `spawnGap = 2`:

```
y0:  B B B
y1:  B R B     red (1,1) is hidden behind red (1,2)
y2:  B R B     red (1,2) touches the bottom ring: accessible
```

7 blue, 2 red. Columns `[R:1]` (group id 0), `[R:1]` (id 1), `[B:7]`. Actions at tick 0: `select`
column 0, then `select` column 1 (both legal: each sees one assignable red at that moment).

| Tick | Phase | What happens                                                                                                                                |
| ---- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 2     | Group 0 (lower id, goes first) spawns f0, target `(1,2)` (distance 0), reserves it. Group 1 finds no assignable red: no spawn.              |
| 1    | 3     | Group 1 has no familiar and no assignable cube: it **stalls** into slot 0, `waiting`, shown 1. Group 0 has a familiar: carries on.          |
| 2    | 1     | f0 picks up `(1,2)`; `R` grows, so `(1,1)` is now accessible. Route length 0 → `deliver`.                                                   |
| 3    | 1/2/3 | f0 delivers (delivered 1), retires (uncommitted 0), group 0 `completed`. Settled.                                                           |
|      |       | Legal now: `resume` slot 0 (assignable `(1,1)`), `select B:7`. Both orders win: e.g. `resume` delivers `(1,1)`, then `select B:7`. **Won.** |

If a different group already held slot 0, group 1's stall at tick 1 would be a **loss (`slotsFull`)**:
selecting two groups of one colour against a single reachable cube is a poor choice with a cost.

## 15. Parameters and their defaults

| Parameter  | Default                         | Notes                                                                         |
| ---------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `K`        | 5                               | Holding slots, 1–8. The extra-slot booster adds one for a level (so up to 9). |
| `fieldCap` | 3                               | Groups working at once, 1–6. Level constant.                                  |
| `squad`    | 3                               | Familiars per group at once, 1–6. Level constant.                             |
| `spawnGap` | 2 ticks                         | Between spawns of one group. Level constant.                                  |
| Pickup     | 1 tick                          | Fixed.                                                                        |
| Deliver    | 1 tick                          | Fixed.                                                                        |
| Tick rate  | tuned in M10 (≈ 8–12 / s at 1×) | Presentation only; 2× doubles it.                                             |
| `portalX`  | `⌊(W−1)/2⌋`                     | Level may override.                                                           |
| Max board  | 40×40 (+ 1-cell ring)           | Sized from mobile tests in M11.2.                                             |

## 16. Open questions

1. **Early loss on `slotsFull`.** A group that runs dry with all slots full loses at once, even if a
   waiting group could have been resumed to fix things. This matches the brief ("groups that cannot
   complete occupy limited holding slots") and keeps losses explainable. It is a feel question for
   gate G1; a softer variant (let the player resume first) would change the loss rule, the solver and
   fixture B line 3.
2. **Target choice.** Targets are chosen by the engine (nearest first). If the vertical slice feels
   passive, a later mechanic could let the player pick a region; not in v2.0.0 scope.
3. **Squad size, spawn gap and tick rate** are feel parameters tuned in M10.3–M10.4, but squad and
   spawn gap are then frozen into the level data.
4. **Portal position** per level (side or top) might help art that is open at the bottom; decided in
   M11.2 if needed.

## 17. Original content rule

The collect-and-deliver structure is a genre mechanic; this spec was written from the product brief,
and the reference game's description of the loop (creatures fetching items to a hole) is mechanical
inspiration only. All art, characters, names, UI and audio are original to Hex & Hue; no Food Hunt
assets, characters, sounds or interface are used or imitated.
