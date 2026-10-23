# Decision measures and the difficulty score (M12.4)

`packages/core/src/collect/measures.ts`. Where M12.3 asks "does cheap play beat this level?", this asks
"what decisions does it contain?". Every measure is computed on the settled-sequential action tree
with the real engine and the solver ([DIFFICULTY_V2.md](DIFFICULTY_V2.md) §3 for the first ones), and
`difficultyScore` turns them into points **without ever reading a failure rate**.

## The measures

`measureLevel(level, options)` returns `null` for a level the solver cannot win (it is not
scored at all), else:

| Measure                           | Meaning                                                                                                                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `doomedFirstShare`                | Share of legal first moves that doom the level (or lose at once)                                                                                                                                                                               |
| `deadEndShare`                    | Along the solver's winning line, the share of the **other** legal actions at each step that doom the level: poor choices that genuinely cost it                                                                                                |
| `freeStepShare`                   | Share of line steps where every legal action leaves a winnable state (v1 baseline: 88 %)                                                                                                                                                       |
| `winningShare`                    | Breadth-first to depth 3: among positions at the deepest enumerated depth, the share not doomed (node cap 1,500 here; the document says 5,000)                                                                                                 |
| `solutions`                       | Distinct parking signatures among winning lines (sorted list of groups that parked), at most 64 lines, 20,000 nodes                                                                                                                            |
| `slack`                           | The level's slots minus the fewest that still win; `slotPressure` is fewest / slots (1 = every slot needed)                                                                                                                                    |
| `recoveryDepth`                   | For losses reached by random play (seeds 0..199) and `most-delivered`: the actions to undo to reach a position that is not doomed, 95th percentile (0 if no loss); `recoverableShare` is the share of losses an undo of at most 2 would rescue |
| `planningDepth`                   | The smallest lookahead depth 1 to 5 whose planning player wins (leaf score = delivered + 2 x free slots), else infinity                                                                                                                        |
| `reachableLoss`                   | A loss is reachable: seen in the tree, a doomed alternative, or witnessed by a player                                                                                                                                                          |
| `branching`, `effectiveBranching` | Legal actions per step of the winning line, and how many of them keep the level winnable                                                                                                                                                       |
| `temptingPoorShare`               | Of the other actions along the line, the share that doom the level **and** would look at least as good as the line's move to the greedy player (they deliver as many cubes now)                                                                |
| `hiddenColors`, `hiddenShare`     | Colours not reachable on the first move (from the peel analysis), and their share of the colours                                                                                                                                               |
| `strategyGap`                     | Best minus worst share of cubes delivered across the nine cheap players and random play                                                                                                                                                        |
| `ticks`, `seconds`                | Ticks of the settled-sequential winning line and seconds at 1x: an upper bound on a person's time (they tap during motion)                                                                                                                     |
| `truncated`                       | Which of `winningShare`, `solutions` and `planning` were cut short by a budget, so a number is not mistaken for an exact one                                                                                                                   |

All are validated against an independent exhaustive oracle on 40 random small levels (a memo-less
search recomputing dead ends, temptation, free steps, branching, opening risk and slack from
scratch), and on crafted levels with known values.

## The score

`difficultyScore(measures)` gives 0 to 100 as the sum of eight components, each printed with its
measure, raw value, 0-to-1 scaling, weight and points (`SCORE_SPEC` in the code is the one
definition):

| Component                        | Reads                                               | Weight |
| -------------------------------- | --------------------------------------------------- | ------ |
| Poor choices that cost the level | `deadEndShare` (full marks at 0.5)                  | 25     |
| Planning depth needed            | `planningDepth` (1 = 0 points, 5 or beyond = full)  | 20     |
| Tempting but poor choices        | `temptingPoorShare` (full at 0.3)                   | 15     |
| Risky first moves                | `doomedFirstShare` (full at 0.5)                    | 10     |
| Slot pressure                    | `slotPressure`                                      | 10     |
| Colours that start buried        | `hiddenShare`                                       | 10     |
| Mistakes that cannot be undone   | `1 - recoverableShare`, only if a loss is reachable | 5      |
| Gap between good and cheap play  | `strategyGap`                                       | 5      |

**Failure rates never enter it.** No component reads `randomRate` or any player's win. A level
cannot score higher by merely losing more often; only decisions count. Tests check that no component
reads a win rate, that setting every failure rate to its extreme leaves the score unchanged, that a
level with no decisions scores below one with real dead ends, and that an unwinnable level is not
scored. The weights are provisional, to be calibrated on real pools (M12.6) and by human play.
Duration is recorded but is not in the score: a long level is not a hard one.

## What it shows on today's levels (`npm run measures:report`)

| level                | score | dead ends | tempting | first-move risk | planning | branching (effective) | slot pressure | buried | recovery | minutes | full bands |
| -------------------- | ----- | --------- | -------- | --------------- | -------- | --------------------- | ------------- | ------ | -------- | ------- | ---------- |
| slice-moonlit-hat    | 46.5  | 0.15      | 0.15     | 0.67            | 2        | 2.43 (2.21)           | 0.5           | 3      | 3        | 1.36    | none       |
| art-crescent-moon    | 3.33  | 0         | 0        | 0               | 1        | 2.58 (2.58)           | 0.33          | 0      | 0        | 2.28    | none       |
| art-triple-moon      | 3.33  | 0         | 0        | 0               | 1        | 2.27 (2.27)           | 0.33          | 0      | 0        | 2.1     | none       |
| art-witchs-cauldron  | 3.33  | 0         | 0        | 0               | 1        | 2.42 (2.42)           | 0.33          | 0      | 0        | 4.21    | none       |
| art-amethyst-cluster | 3.33  | 0         | 0        | 0               | 1        | 2.33 (2.33)           | 0.33          | 0      | 0        | 4.99    | none       |
| art-libra-scales     | 5.83  | 0         | 0        | 0               | 1        | 2.54 (2.54)           | 0.33          | 1      | 0        | 3.97    | none       |
| art-black-cat        | 12.97 | 0         | 0        | 0               | 1        | 2.44 (2.44)           | 0.5           | 3      | 1        | 4.43    | none       |

- **The hand-designed slice scores 46.5**: 2 of 3 first moves doom it, 15 % of the other choices along
  the winning line are poor and tempting, planning depth 2, a 3-action recovery depth.
- **The generated art levels score 3 to 13.** Five have no dead end, no tempting choice, no risky
  first move and planning depth 1: their points come from slot pressure and buried colours.
- **The black cat shows why failure rates are not the score:** random play fails 15 % of runs (its
  extra slots run out) yet no single alternative along its winning line dooms it, so it scores 13,
  not high. Its losses need two bad choices in a row, which a per-step measure reads as no
  dead end.
- **No level meets a full tier band.** The slice is close to hard: it misses medium on four rows
  (`doomedFirstShare` 0.67 over 0.35, `freeStepShare` 0.86 over 0.5, `solutions` 1 under 2,
  `winningShare` 1 over 0.5) and hard on three (`freeStepShare` 0.86 over 0.3, `winningShare` 1 over
  0.25, `planningDepth` 2 under 3). The art levels fail the tree rows of every tier. The slice is the
  target the generator has not reached.

## Limits

- Dead ends are measured one step from the winning line (the alternatives at each of its steps),
  so a level whose traps need two wrong moves in a row reads as safer than it plays. The solver
  tree could measure deeper; that is a possible refinement, not done here.
- `winningShare` uses a smaller node cap than the document (1,500 vs 5,000) and is flagged in
  `truncated` when it is hit; so are `solutions` and `planningDepth`.
- The score weights are provisional; the score ranks levels, it is not yet a tier assignment.
