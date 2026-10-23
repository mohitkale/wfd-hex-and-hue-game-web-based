# Strategic Difficulty v2

_Written in M8.4. Companion to `docs/GAME_DESIGN_V2.md`. The machine-readable form of every number
here is `content/difficulty.ts`; M12.3 (simulated players) and M12.6 (CI gate) consume it. A test
(`content/difficulty.test.ts`) parses the tier table in §5 and fails if it differs from the code._

**Status of the numbers: provisional.** They are derived from the v1 baseline
(`docs/V2_GAMEPLAY_AUDIT.md` §3, §3a, §3b) and from the intent of each tier, and are calibrated in
M12.4 against the first pool of generated v2 levels and again after human play (G1, G3). Changing a
number means editing this file and `content/difficulty.ts` together. The level-number to tier
mapping (§5) is defined by the curve of [V2_CURVE.md](V2_CURVE.md) (M12.5).

## 1. Why v1 failed this test

v1's easiest-to-find strategy ("finish the charge") won 97% of its 60 levels, random play won 64%,
and at 88% of steps along the intended solution every legal move still won. A v2 level is accepted
only if simple, non-planning play does **not** win it, except in the tutorial and easy tiers where
winning easily is the point. The v2 bands bound each of those three v1 symptoms (§5: `simpleWins`
and the per-player rules, `randomRate`, `freeStepShare`).

## 2. The simulated players (normative)

**How every player acts.** Players use the _settled-sequential_ model of GAME_DESIGN_V2 §10: they act
only at settled states, take one legal action, and the engine runs ticks until settled again.
Concurrent tapping is not simulated (settled play is always available to a human, and concurrency can
only add ways to lose). If an action ends the game in a loss, the run is a loss. A run that makes
more than `3 × groups` actions is a loss for the win-rate only (it never counts as a reachable loss).

**Legal action order.** All legal actions at a state are listed as: column fronts by ascending
column index, then waiting groups by ascending slot index. "First" below means first in this list;
"tie" means the earlier in this list.

| Id  | Name              | Rule                                                                                                                                                                            |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1a | `first-front`     | Column-spam, left to right. The first legal **column front**; a waiting group is resumed only if no front is legal.                                                             |
| S1b | `last-front`      | Column-spam, right to left. The **last** legal column front; a waiting group only if no front is legal.                                                                         |
| S1c | `round-robin`     | Column-spam, one from each column. Cycle through column indices starting after the column used last (first action: column 0); take that column's front if legal, else the next. |
| S2  | `tidy-left`       | Resume the first legal waiting group; otherwise the first legal front.                                                                                                          |
| S3  | `tidy-right`      | Resume the first legal waiting group; otherwise the last legal front.                                                                                                           |
| S4  | `largest`         | The legal action (front or waiting) whose group has the largest remaining capacity; ties by list order.                                                                         |
| S5  | `smallest`        | As S4 with the smallest remaining capacity.                                                                                                                                     |
| S6  | `random`          | Uniform among legal actions. Runs `0..199` with the core PRNG (`createRng(seed)`); the metric is the fraction of runs won.                                                      |
| S7  | `most-delivered`  | The legal action whose settled run delivers the most cubes (computed by simulating each; it does not avoid losing actions); ties by list order.                                 |
| S8  | `clears-capacity` | Among legal actions whose settled run completes the group, the one delivering the most (ties by list order); if none completes its group, behave as S7.                         |

The brief's eight players are S1a (first column until empty), S2/S3 plus S1b (left to right and right
to left), S4, S5, S6, S7 and S8; S1c adds the "front of column 1, 2, 3, then repeat" order, so
column-spam is covered in every order. S1a, S1b and S1c are the **column-spam** family; S2 and S3 are
their tidy variants; S7 and S8 are the cheap greedy players (S8 is the v1 "finish-the-charge"
winner). None looks more than one action ahead.

Per level the report records a win/loss for each of the nine deterministic players, the `random` win
rate, and `simpleWins` = how many of the nine deterministic players win.

Legitimate strategies are protected by construction: these players are not planners, and a level is
never penalised because a human (or the solver) finds a clever line. The gate only asks that **cheap
play does not win by itself**; tutorial and easy levels are allowed to be easy.

## 3. Other measures (normative)

All use the settled-sequential action tree: nodes are settled states, edges are legal actions, nodes
are enumerated in the legal-action order above. A node is **doomed** if it is not lost but the
solver (budget 20,000 nodes; `unknown` counts as not doomed) finds no winning line from it.

| Measure            | Definition                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `doomedFirstShare` | Fraction of legal first actions that lead to a doomed (or lost) state.                                                                                                                                                                                                                                                                                     |
| `deadEndShare`     | Along the stored winning line, at each step consider the legal actions other than the one on the line; the fraction of those alternatives that lead to a doomed or lost state. This is the **genuine dead end** measure: poor choices that cost the level.                                                                                                 |
| `freeStepShare`    | Fraction of steps along the stored winning line at which **every** legal action leaves a winnable state (v1 baseline: 88%).                                                                                                                                                                                                                                |
| `winningShare`     | Enumerate the tree breadth-first to depth 3 or to 5,000 nodes, whichever ends first (no sampling). Among non-lost nodes at the deepest fully enumerated depth, the share that are not doomed.                                                                                                                                                              |
| `solutions`        | Distinct **parking signatures** among winning lines found by depth-first search in the legal-action order (budget 20,000 nodes, stop at 64 lines): the signature of a line is the sorted list of groups that parked at least once. Lines that only reorder independent actions share a signature. Fixture B has three (nothing parks / R parks / G parks). |
| `slack`            | `K − minSlots`, where `minSlots` is the fewest slots for which the level is still solvable.                                                                                                                                                                                                                                                                |
| `recoveryDepth`    | For every loss reached by `random` (runs 0..199) and `most-delivered`: the fewest player actions to undo to reach a state that is not doomed. Reported as the 95th percentile; **0 if no loss is reached**. Assumes multi-step Undo; whether the game offers it is decided in M14.4, and if only one step is offered these bands are revisited.            |
| `planningDepth`    | Smallest `d ∈ 1..5` such that the depth-`d` lookahead player wins, else `∞`. That player enumerates all action sequences of length `d` over settled states, scores a leaf `delivered + 2 × freeSlots` (won = +∞, lost = −∞), takes the first action of the best sequence (ties: first in list order). `d = 1` is therefore well defined.                   |
| `reachableLoss`    | Some loss (`slotsFull` or `deadlock`) is reachable by legal play: proved by the solver's tree or witnessed by any player above.                                                                                                                                                                                                                            |

## 4. What each requirement means

- **Easy tutorial puzzles** teach the loop: most simple play wins, losing is impossible in tutorial
  levels 1–3 and possible but recoverable with one Undo in levels 4–5.
- **Medium puzzles** need careful group selection: all column-spam players must lose, the cheap greedy
  players may not both win, random play usually fails but sometimes wins.
- **Hard puzzles** have meaningful dependencies and few spare slots: none of the column-spam, tidy or
  greedy players win, random wins rarely, at most one slot of slack, and planning at least three
  actions ahead is needed.
- **Genuine dead ends:** from the easy tier up, `deadEndShare > 0`: some tempting alternative really
  does end the level.
- **Multiple solutions:** at least two strategically different winning lines up to medium (so players
  are not punished for a different valid idea); hard levels may have one narrow line.
- **Fair recovery:** from losses cheap play reaches, undoing a few actions (or using an earned
  booster, M14.4) gets back to a winnable state; the bands cap how many.

## 5. Tier table

Tier by 1-based global level number (the curve of V2_CURVE.md, M12.5): tutorial 1–5, easy 6–15, medium 16–30,
hard 31+. Scheduled breather levels may drop one tier. "—" means no requirement.

| Requirement         | Tutorial | Easy        | Medium      | Hard        |
| ------------------- | -------- | ----------- | ----------- | ----------- |
| `simpleWins` (of 9) | ≥ 6      | 3 – 7       | ≤ 3         | ≤ 1         |
| `random` win rate   | ≥ 0.80   | 0.40 – 0.90 | 0.05 – 0.45 | ≤ 0.25      |
| `doomedFirstShare`  | ≤ 0      | ≤ 0.20      | ≤ 0.35      | 0.20 – 0.70 |
| `deadEndShare`      | ≤ 0.25   | 0.02 – 0.30 | 0.05 – 0.50 | 0.15 – 0.70 |
| `freeStepShare`     | ≥ 0.80   | ≤ 0.70      | ≤ 0.50      | ≤ 0.30      |
| `solutions`         | ≥ 2      | ≥ 2         | ≥ 2         | ≥ 1         |
| `winningShare`      | —        | —           | ≤ 0.50      | ≤ 0.25      |
| `slack`             | ≥ 2      | ≥ 1         | ≥ 1         | ≤ 1         |
| `recoveryDepth`     | ≤ 1      | ≤ 2         | ≤ 3         | ≤ 4         |
| `planningDepth`     | ≤ 1      | 1 – 2       | 2 – 4       | 3 – 5       |

Player rules (code: `mustWin`, `mustLose`, `notBothWin`) and the reachable-loss rule:

| Rule              | Tutorial                       | Easy     | Medium                                     | Hard                                                                                                       |
| ----------------- | ------------------------------ | -------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Must win          | `first-front`                  | —        | —                                          | —                                                                                                          |
| Must lose         | —                              | —        | `first-front`, `last-front`, `round-robin` | `first-front`, `last-front`, `round-robin`, `tidy-left`, `tidy-right`, `most-delivered`, `clears-capacity` |
| Must not both win | —                              | —        | `most-delivered` + `clears-capacity`       | —                                                                                                          |
| Reachable loss    | levels 1–3 never, 4–5 required | required | required                                   | required                                                                                                   |

World-level repetition check (`checkWorld`, run over each world's levels of a tier): no single
deterministic player may win more than **50%** of a world's medium levels or more than **25%** of its
hard levels. A hard level beaten by `largest` and `smallest` together is already rejected by
`simpleWins ≤ 1`; the world check catches one lucky player winning many medium levels.

## 6. How the checks run

1. For a candidate level, run the players (S6 on seeds 0..199) with the real engine.
2. Run the solver for the tree measures, `slack`, `solutions`, and the lookahead players.
3. Compare with the level's tier (`checkLevel(metrics, tier, level)`); a tutorial level must be given
   its level number. Any failing row rejects the candidate (M12.2 tries another seed or
   arrangement) and the report (M12.6) shows which rows failed.
4. After all levels of a world are measured, run `checkWorld`.
5. CI repeats this for every shipped level; a level that no longer passes fails the build.

## 7. Open points

- Whether `planningDepth` with this evaluation is stable and discriminating is decided in M12.4; if
  not it is replaced and §5 updated.
- Calibration of every cell happens on real generated pools (M12.4/M12.6). The first human play
  (gate G1) may move bands more than any simulation.
- Special-mechanic levels (M13.4) may add rows for the new mechanic, never relax these.
