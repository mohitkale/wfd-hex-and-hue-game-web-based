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
| `winningShare`                    | Breadth-first to depth 3: among the non-lost positions at the deepest enumerated depth (won ones count as not doomed), the share not doomed (node cap 1,500 here; the document says 5,000)                                                     |
| `solutions`                       | Distinct parking signatures among winning lines (sorted list of groups that parked), at most 64 lines, 20,000 nodes                                                                                                                            |
| `slack`                           | The level's slots minus the fewest that still win; `slotPressure` is fewest / slots (1 = every slot needed)                                                                                                                                    |
| `recoveryDepth`                   | For losses reached by random play (seeds 0..199) and `most-delivered`: the actions to undo to reach a position that is not doomed, 95th percentile (0 if no loss); `recoverableShare` is the share of losses an undo of at most 2 would rescue |
| `planningDepth`                   | The smallest lookahead depth 1 to 5 whose planning player wins (leaf score = delivered + 2 x free slots), else infinity; if a decision exceeds the node budget it is the lower bound reached, flagged in `truncated`                           |
| `reachableLoss`                   | A loss is reachable: seen in the tree, a doomed alternative, or witnessed by a player                                                                                                                                                          |
| `branching`, `effectiveBranching` | Legal actions per step of the winning line, and how many of them keep the level winnable                                                                                                                                                       |
| `temptingPoorShare`               | Of the other actions along the line, the share that doom the level **and** the greedy player would take over the line's move (more cubes now, or as many and earlier in list order)                                                            |
| `hiddenColors`, `hiddenShare`     | Colours not reachable on the first move (from the peel analysis), and their share of the colours                                                                                                                                               |
| `strategyGap`                     | Best minus worst share of cubes delivered across the nine cheap players and random play                                                                                                                                                        |
| `ticks`, `seconds`                | Ticks of the settled-sequential winning line and seconds at 1x: an upper bound on a person's time (they tap during motion)                                                                                                                     |
| `truncated`                       | Which of `winningShare`, `solutions` and `planning` were cut short by a budget, so a number is not mistaken for an exact one                                                                                                                   |

Validated against independent code on small random levels: a memo-less exhaustive search
recomputes dead ends, temptation, free steps, branching, opening risk and slack (40 levels), a plain
lookahead player recomputes `planningDepth` (30 levels, some needing planning) and a plain
enumeration recomputes `winningShare` (including levels where depth-3 positions are doomed).
`solutions`, `recoveryDepth`/`recoverableShare`, `reachableLoss`, duration and buried colours are
checked on fixtures with known values (fixture B has three kinds of winning line: nothing parks,
red parks, green parks).

## The score

`difficultyScore(measures)` gives 0 to 100 as the weighted sum of six components, each printed with
its measure, raw value, 0-to-1 scaling, weight and points (`SCORE_SPEC` in the code is the one
definition):

| Component                        | Reads                                    | Weight |
| -------------------------------- | ---------------------------------------- | ------ |
| Poor choices that cost the level | `deadEndShare` (full marks at 0.5)       | 30     |
| Planning depth needed            | `planningDepth` (1 = 0 points, 5 = full) | 25     |
| Tempting but poor choices        | `temptingPoorShare` (full at 0.3)        | 15     |
| Risky first moves                | `doomedFirstShare` (full at 0.5)         | 10     |
| Slot pressure                    | `slotPressure`                           | 10     |
| Colours that start buried        | `hiddenShare`                            | 10     |

**Not scored, only recorded** (`UNSCORED` in the code): `randomRate`, `wins`, `reachableLoss`,
`strategyGap`, `recoveryDepth`, `recoverableShare`, `ticks` and `seconds`. The first group depends on how
players happen to fail, the second on how long play takes (a long level is not a hard one). An earlier
draft scored the strategy gap and the recoverable share; review showed both rise merely because some
run failed (the gap is max minus min over 200 random runs, so one bad run sets it), so they were
removed from the score. What remains is read off the solver's tree (dead ends, tempting poor choices,
risky first moves), the planning player, the slot count and the picture's buried colours.

**Failure rates never enter it.** A test sets every failure-derived measure to its extreme in both
directions at once and checks the score is unchanged, checks that no scored component reads an
unscored measure, that a level with no decisions scores below one with real dead ends, and that an
unwinnable level is not scored. `slotPressure` is a structure baseline (a level whose slots are all
needed), not a failure measure; it is why decision-free levels still show 3 to 5 points.
When a budget cuts the planning search short, `planningDepth` is reported as the lower bound reached
(never as unreachable) and the component is left out and the rest rescaled
(`excluded` on the component). The weights are provisional, to be calibrated on real pools (M12.6)
and by human play.

## What it shows on today's levels (`npm run measures:report`)

| level                | score | dead ends | tempting | first-move risk | planning | branching (effective) | slot pressure | buried | recovery | minutes | full bands |
| -------------------- | ----- | --------- | -------- | --------------- | -------- | --------------------- | ------------- | ------ | -------- | ------- | ---------- |
| slice-moonlit-hat    | 40.25 | 0.15      | 0.1      | 0.67            | 2        | 2.43 (2.21)           | 0.5           | 3      | 3        | 1.36    | none       |
| art-crescent-moon    | 3.33  | 0         | 0        | 0               | 1        | 2.58 (2.58)           | 0.33          | 0      | 0        | 2.28    | none       |
| art-triple-moon      | 3.33  | 0         | 0        | 0               | 1        | 2.27 (2.27)           | 0.33          | 0      | 0        | 2.1     | none       |
| art-witchs-cauldron  | 3.33  | 0         | 0        | 0               | 1        | 2.42 (2.42)           | 0.33          | 0      | 0        | 4.21    | none       |
| art-amethyst-cluster | 3.33  | 0         | 0        | 0               | 1        | 2.33 (2.33)           | 0.33          | 0      | 0        | 4.99    | none       |
| art-libra-scales     | 5.83  | 0         | 0        | 0               | 1        | 2.54 (2.54)           | 0.33          | 1      | 0        | 3.97    | none       |
| art-black-cat        | 11    | 0         | 0        | 0               | 1        | 2.44 (2.44)           | 0.5           | 3      | 1        | 4.43    | none       |

- **The hand-designed slice scores 40**: 2 of 3 first moves doom it, 15 % of the other choices along
  the winning line doom the level (10 % of them tempting, i.e. the greedy player would take them),
  planning depth 2, a 3-action recovery depth.
- **The generated art levels score 3 to 11.** Five have no dead end, no tempting choice, no risky
  first move and planning depth 1: their points come from slot pressure and buried colours.
- **The black cat shows why failure rates are not the score:** random play fails 15 % of runs (its
  extra slots run out) yet no single alternative along its winning line dooms it, so it scores 11,
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
