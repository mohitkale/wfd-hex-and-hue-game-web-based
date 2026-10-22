# Hex & Hue: Magic Pixel Puzzle — Game Design Spec v2

_A Little Magic in Every Color._

**Status:** draft for v2.0.0 (roadmap M8–M15). Written in M8.2; reachability edge cases are completed
in M8.3, difficulty bands in M8.4 and the vertical-slice data model in M8.5. This is the source of
truth for the v2 engine (`packages/core/src/collect/`). `docs/GAME_DESIGN.md` describes the shipped
v1 track mechanic and stays until the v2 switch (M15.5).

The engine must implement exactly these rules, deterministically, so that the solver, the renderer
and a replayed action log all see the same game. Why v2 exists: `docs/V2_GAMEPLAY_AUDIT.md`.

## 1. The game in one paragraph

A dense pixel-art picture is built from coloured **cubes**. Beneath it, **columns** of numbered
**summon groups** wait; only the front group of each column can be chosen. Choosing a group opens it
in a **holding slot** and its colour of **familiars** (magical collectors) walk out of the **portal**,
head for cubes of their colour that they can physically reach, pick one up, carry it back and drop it
through the portal. Only a delivered cube counts. The number on a group is how many cubes it can still
deliver. Cubes that sit behind other colours cannot be reached until those are cleared, so a group
may run out of reachable cubes with capacity left: it then waits in its slot. Slots are limited. Clear
the whole picture to win; open the wrong groups in the wrong order and you can strand every slot.

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

| Term            | Meaning                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Cube            | One coloured cell of the mosaic. Removed only by delivery.                                                                           |
| Open space      | The empty margin ring around the mosaic plus every emptied mosaic cell. Familiars walk only here.                                    |
| Portal          | A margin cell (default: directly below the bottom row, centred). Familiars start and end here; deliveries happen here.               |
| Reachable       | A cell is reachable if it is open space connected to the portal through open space (4-neighbour).                                    |
| Accessible cube | A cube with at least one reachable 4-neighbour. Hidden cubes (behind other cubes, or in sealed pockets) are not accessible.          |
| Group           | A colour and a **capacity** `n ≥ 1`: how many more cubes this group may deliver. The number on screen is the remaining capacity.     |
| Column          | An ordered stack of groups. `columns[c][0]` is the front; only fronts can be chosen.                                                 |
| Slot            | One of `K` seats. An **open** group (working or waiting) occupies one. Completed groups leave.                                       |
| Familiar        | A collector belonging to one group. Walks, picks up, carries, delivers. Purely an actor of its group; it has no capacity of its own. |
| Squad           | The most familiars one group has out at once (`squad`, default 3).                                                                   |
| Assignable cube | An accessible, unreserved cube of a group's colour.                                                                                  |
| Reserved        | A cube a familiar has been sent to fetch. No other familiar may target it.                                                           |
| Tick            | One discrete simulation step (§7). Every familiar performs exactly one action per tick.                                              |
| Settled         | No familiar exists. Every open group is then complete or waiting.                                                                    |

Familiars are the actors; the original Food Hunt look (ants, food) is **not** used. Names, art and
sounds are original to Hex & Hue (M10.1).

## 3. Level data

A level is: `width`, `height`, `palette`, `cells` (palette index or `EMPTY`, row-major, `y = 0` top),
`columns: {color, capacity}[][]`, `slots K`, optional `squad`, optional `portalX`. Rules:

- Every colour's total group capacity equals its cube count (nothing to over- or under-collect).
- At least one group exists and `K ≥ 1`.
- Every cube is reachable in principle: the level has a **settled-sequential solution** (§10), stored
  with it and verified by the solver.

The exact serialisation, limits and module layout are fixed in M8.5.

## 4. Open space and reachability

Coordinates are mosaic coordinates `(x, y)` with `0 ≤ x < W`, `0 ≤ y < H`. The **margin ring** is
every cell with `x ∈ [-1, W]`, `y ∈ [-1, H]` outside the mosaic. A cell is **open** when it is in the
ring or is a mosaic cell with no cube. The portal is the ring cell `(portalX, H)` (default
`portalX = ⌊(W−1)/2⌋`).

- **Reachable set** `R` = open cells connected to the portal by 4-neighbour moves through open cells.
  Because cubes are only ever removed, `R` only grows.
- A cube is **accessible** if any of its 4 neighbours is in `R`.
- A familiar's **standing cell** for a cube is a neighbour of the cube that is in `R`. Pickup happens
  from there; the familiar never enters the cube's cell until the cube is gone.
- Hidden cubes are never collected remotely: access needs a clear neighbour, never a line of sight.
- Sealed pockets (empty cells enclosed by cubes, not connected to the ring) are **not** in `R`; cubes
  that only touch a sealed pocket are not accessible. They become accessible when a neighbouring
  cube is removed and the pocket joins `R`.

Completed edge-case table, algorithm cost and tie-breaks: M8.3.

**Targeting.** For a group of colour `c` the **assignable cubes** are the accessible, unreserved cubes
of colour `c`. Distance of a cube = the smallest BFS distance from the portal to any of its
reachable neighbours (BFS over `R`, expanding neighbours in the fixed order **up, left, right,
down**). A group's next target is the assignable cube with the smallest distance; ties go to the
smaller `y`, then the smaller `x`. Its standing cell is the nearest reachable neighbour (ties:
smaller `y`, then smaller `x`). The walking route is the BFS parent chain from the portal to the
standing cell. Routes are stored when assigned; they stay valid forever because `R` only grows.

## 5. Groups, columns and slots

A group is in exactly one of these places and states:

| State       | Where   | Meaning                                                                                       |
| ----------- | ------- | --------------------------------------------------------------------------------------------- |
| `queued`    | column  | Waiting. Selectable only when it is the column front.                                         |
| `working`   | a slot  | Has familiars out, or can send them: capacity is left and an assignable cube exists.          |
| `waiting`   | a slot  | Capacity left but no familiar out and no assignable cube. Sleeps until the player resumes it. |
| `completed` | nowhere | Delivered its whole capacity. Its slot is free again the same tick.                           |

Capacity bookkeeping, per group, at all times:

```
delivered + inFlight(committed) + uncommitted = capacity at selection
shown number = capacity − delivered           (it drops only on delivery)
```

where `committed` is the number of cubes currently reserved by the group's familiars. A group never
commits more cubes than it has uncommitted capacity, so it can neither over-collect nor leave a
phantom familiar. Leftover capacity is kept exactly: a purple 12 that can reach only 7 purple cubes
delivers 7, turns `waiting` showing **5**, and may be resumed later to deliver the other 5.

Why a slot is held while a group works (design decision, see §15): in **settled play** (only one
group working at a time, §10) this is the same as "only groups that could not finish occupy a slot",
because a group that finishes frees its seat before the next choice. In live play it also caps how
many groups can work at once at `K`.

## 6. Player actions

There is no timer. Actions happen between ticks.

1. **Select** a column front: legal only if a slot is free **and** the group has at least one
   assignable cube. The group leaves its column (the next group becomes the front), takes the
   lowest-numbered free slot and becomes `working`.
2. **Resume** a `waiting` group: legal only if it now has at least one assignable cube. It becomes
   `working` again. It keeps its slot.
3. **Boosters** (Undo, extra slot, …) are defined in M14.4; Undo restores the state before the last
   select/resume.

Illegal taps do nothing to the game (the UI explains why: no free slot, or "no reachable cube of this
colour yet"). They never cost anything.

## 7. The tick

State changes only through `select`/`resume` and `step`. One `step` is one tick and runs four phases
in a fixed order. All iteration orders below are part of the rules.

**Phase 1 — act.** Each familiar, in ascending familiar id, performs its single action:

| Familiar state | Action this tick                                                                                               | Next state             |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `toCube`       | Move one cell along its route. If that was the last cell it is on its standing cell.                           | `pickup` if arrived    |
| `pickup`       | Remove the reserved cube (its cell becomes open; `R` is updated at the end of the phase). Cube is now carried. | `carrying`             |
| `carrying`     | Move one cell back along the route. If it reached the portal it is there.                                      | `deliver` if at portal |
| `deliver`      | `delivered += 1`, `committed −= 1`. The carried cube counts as collected.                                      | `idle`                 |

A route of length 0 (standing cell is the portal) skips straight to `pickup` or `deliver`. Removing
cubes during the phase is applied in familiar-id order, but exposure (`R`) is recomputed once at the
end of Phase 1, so two pickups in one tick never expose a cube to each other's decisions that tick.

**Phase 2 — dispatch.** For each `working` group in ascending slot index:

1. Each `idle` familiar of the group, in id order: if the group has uncommitted capacity and an
   assignable cube, it is assigned the next target (§4), reserves it and becomes `toCube` (or
   `pickup` for a zero-length route). Otherwise it **retires** into the portal and is removed.
2. If `tick ≥ group.nextSpawn`, the group has fewer than `squad` familiars, uncommitted capacity, and
   an assignable cube: spawn a familiar at the portal with that target; `nextSpawn = tick + spawnGap`
   (`spawnGap` default 2). Repeat at most once per tick per group.

**Phase 3 — resolve.** For each `working` group, in slot order:

- `delivered = capacity` → `completed`, slot freed, `completed` event.
- No familiar exists and no assignable cube exists → `waiting` (capacity left stays exact).

**Phase 4 — status.** If no cube remains: **won**. Otherwise, if the state is settled and no legal
action exists (§8): **lost**. Win and loss are functions of the logical state only; they are never
decided by animation, frame rate or timing.

`step` on a won/lost state does nothing. `tick` increments only on effective steps.

## 8. Win and lose

- **Won:** every cube has been delivered. By the capacity invariant every group is then completed.
- **Lost:** the state is settled (no familiar exists), cubes remain, and there is **no legal action**:
  no queued front can be selected (no free slot, or its colour has no assignable cube) and no
  `waiting` group has an assignable cube. Nothing can ever change again, so the loss is a genuine
  deadlock. The typical cause is every slot held by a `waiting` group whose colour is buried under
  cubes that only a queued group could remove, and that group has no seat.
- Each legal action eventually delivers at least one cube, so every game ends.
- The game does not declare a loss early for positions that are merely doomed but still have legal
  moves; an optional "doomed" hint (M14) may use the solver.

Undo and boosters can recover from a loss (M14.4). Retry is always free and instant.

## 9. Concurrency

The player may select a second group while the first is still working (up to `K` groups at once);
their familiars share the same open space and never block each other (they may overlap). Because the
tick rules fix every ordering, the result of a given **action log** (list of `(tick, action)`) is
unique. Speed (1× or 2×) changes only how many ticks are shown per second; the same log gives the
same outcome at either speed.

Concurrency is a convenience and a risk, not an advantage the solver relies on: opening several
groups at once can strand more slots than waiting would.

## 10. Settled play and the solvability guarantee

A player may always wait until the board is settled before choosing again. The **settled-sequential
model** is exactly that: from a settled state the only moves are "select a legal front" or "resume a
legal waiting group", followed by running ticks until settled again. The solver searches this model.

- A level is valid iff the settled-sequential model has a winning line, stored with the level.
- A winning line in this model is always playable in the real game (just wait between taps).
- State identity for the solver: for each column its group count, for each slot its group and
  remaining capacity, and which cubes remain. Tick counters, route data and spawn timers are not part
  of it: at a settled state they carry no information.
- Because the outcome of running a single group to settled is a deterministic function of the board
  (§4, §7), the solver can use the real engine as its transition function, so a solver line replays
  in the live engine tick for tick. There is no separate "solver model" to drift.

## 11. Determinism and replay

- Seeded RNG only, and only for level generation and cosmetic effects; the simulation itself has no
  randomness at all. No `Date.now()` / `Math.random()` in `packages/core`.
- State is plain serialisable data. The renderer interpolates familiars between ticks and never
  mutates state.
- Events (M9.4): `familiarSpawned`, `familiarMoved`, `cubeReserved`, `cubePickedUp`,
  `cubeDelivered`, `groupSelected`, `groupWaiting`, `groupResumed`, `groupPartial` (capacity left),
  `groupCompleted`, `slotReleased`, `won`, `lost`.
- Replaying an action log from the level start reproduces the same state and event sequence.

## 12. Difficulty levers (bands set in M8.4)

Number of colours and groups · group capacities versus exposed cubes (how often a group must wait) ·
column ordering (a needed group buried behind one that is not useful yet) · hidden-colour
dependencies (colour A can only be cleared once B is gone) · fewer slots `K` · squad size has no
effect on logic, only on speed of play. **Never** a timer and never artificially slow movement.

## 13. Speed, rewards, boosters

- 1× is always free. 2× is a presentation speed that unlocks for the current level only through an
  optional rewarded ad (M14.3); with no working ad provider it is not offered. It never changes
  outcomes.
- Boosters are re-specified for this model in M14.4 and must each have a tested effect. Retry is
  always free; there are no lives, energy or forced ads.

## 14. Worked examples

These are fixtures for M9.5. Coordinates are `(x, y)`; the portal is `P`.

### A. One familiar, tick by tick (pickup, carry, deliver, continue, complete)

Board `W=3, H=1`, cubes `R R R` at `(0,0) (1,0) (2,0)`. Portal `P = (1, 1)`. Columns: `[R:2]`, `[R:1]`.
`K=2`, `squad=1`, `spawnGap=1`. The player selects the first group (R:2) at tick 0.

| Tick | Phase | What happens                                                                                                                                                                                                                                                                                                                                                |
| ---- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | —     | `select`: R:2 takes slot 0, `working`. Cubes remain 3.                                                                                                                                                                                                                                                                                                      |
| 1    | 2     | Assignable R cubes: all 3. Distances: cube `(1,0)` has neighbour `P` at distance 0; `(0,0)` and `(2,0)` have distance 1. Nearest: `(1,0)`. Spawn f0, route length 0, state `pickup`. committed = 1.                                                                                                                                                         |
| 2    | 1     | f0 picks up `(1,0)`; the cell is open. f0 `carrying`, already at `P` → `deliver`. (Squad is full, no spawn.)                                                                                                                                                                                                                                                |
| 3    | 1/2   | Phase 1: f0 delivers: delivered = 1, committed = 0, `idle`. Phase 2: uncommitted = 1 and assignable cubes `(0,0)` and `(2,0)` (distance 1 each; tie → smaller `x`): target `(0,0)`. Its reachable neighbours are `(1,0)` (the cell just vacated) and `(0,1)`, both at distance 1; tie → smaller `y`: standing cell `(1,0)`, route `P → (1,0)`. f0 `toCube`. |
| 4    | 1     | f0 moves `P → (1,0)`, arrives, `pickup`.                                                                                                                                                                                                                                                                                                                    |
| 5    | 1     | f0 picks up `(0,0)`; `carrying`.                                                                                                                                                                                                                                                                                                                            |
| 6    | 1     | f0 moves `(1,0) → P`, `deliver`.                                                                                                                                                                                                                                                                                                                            |
| 7    | 1/3   | f0 delivers: delivered = 2 = capacity. Phase 2 finds nothing for it: f0 retires. Phase 3: group `completed`, slot 0 free. One R cube `(2,0)` remains.                                                                                                                                                                                                       |

The count shown on the group went 2 → 1 (tick 3) → 0 (tick 7), each time on delivery. The other
group `R:1` is now the only legal move and finishes the level the same way.

### B. Capacity is preserved when cubes are hidden (the losing and the winning choice)

Board `W=3, H=4`; `B` blue, `R` red, portal at the bottom-centre margin.

```
y0:  B B B
y1:  B R B     ← red (1,1) is sealed in by blue on all four sides
y2:  B B B
y3:  B R B     ← red (1,3) touches the bottom ring: accessible
```

Cubes: 10 blue, 2 red. Columns: `[R:2]`, `[B:10]`. `K = 1`.

- **Losing choice.** Select `R:2` (seat 0). Accessible reds: `(1,3)` only. The familiar delivers it.
  Now no assignable red exists, no familiar exists: group → `waiting`, number shown **1**. State is
  settled; cubes remain; the only front `B:10` needs a free slot (none, `K = 1`) and `R:2` has no
  accessible red. **No legal action: lost.**
- **Winning choice.** Select `B:10` first (seat 0). Blue closure: border blues are accessible, then
  `(1,2)` once `(0,2)` or `(2,2)` is gone; all 10 are delivered, the group completes and frees the
  seat, and both reds are now accessible. Then select `R:2`: it delivers both. **Won.**

This is the smallest "blocked colour + limited slot" decision; the explanation a player can give is
"red was buried, blue had to go first".

### C. Capacity binding changes what is left

If a group `purple:12` is selected while 9 purple cubes are accessible, it commits to at most 12 and
delivers min(12, purple cubes reachable over the run). If 7 are reachable it delivers 7, turns
`waiting` with **5**, keeps its seat, and may be resumed once the cubes that hid the other purples are
gone. If instead 15 are reachable, it delivers exactly 12 and the 3 left over belong to another
purple group (by the §3 invariant). Which 12 of the 15 are taken is decided by the nearest-first rule
(§4), so it is deterministic.

## 15. Parameters and their defaults

| Parameter   | Default                         | Notes                                                                |
| ----------- | ------------------------------- | -------------------------------------------------------------------- |
| `K` (slots) | 5                               | Per level, 1–8. Extra-slot booster adds one for a level.             |
| `squad`     | 3                               | Familiars per group at once, 1–6. Affects pace, not outcomes' logic. |
| `spawnGap`  | 2 ticks                         | Between spawns of one group.                                         |
| Pickup      | 1 tick                          | Fixed.                                                               |
| Deliver     | 1 tick                          | Fixed.                                                               |
| Tick rate   | tuned in M10 (≈ 8–12 / s at 1×) | Presentation only; 2× doubles it.                                    |
| `portalX`   | `⌊(W−1)/2⌋`                     | Level may override.                                                  |
| Max board   | 40×40 (+ 1-cell ring)           | Sized from mobile tests in M11.2.                                    |

## 16. Open questions

1. **Slot held while working (rule B) versus slot used only when stalled (rule A).** They coincide in
   settled play. B caps live concurrency at `K` and never loses on a tap; A would lose at the moment
   a group stalls with all slots full. Chosen: B. To be confirmed by feel at gate G1.
2. **Pickup choice.** Targets are chosen by the engine (nearest first). If the vertical slice feels
   passive, a later mechanic could let the player pick a region; not in v2.0.0 scope.
3. **Squad size and tick rate** are feel parameters, tuned in M10.3–M10.4.
4. **Portal position** per level (side or top) might help art that is open at the bottom; decided in
   M11.2 if needed.

## 17. Original content rule

The collect-and-deliver structure is a genre mechanic. All art, characters, names, UI and audio are
original to Hex & Hue; no Food Hunt assets, characters, sounds or interface are used or imitated.
