# Strategic Difficulty v2

_Written in M8.4. Companion to `docs/GAME_DESIGN_V2.md`. The machine-readable form of every number
here is `content/difficulty.ts`; M12.3 (simulated players) and M12.6 (CI gate) consume it._

**Status of the numbers: provisional.** They are derived from the v1 baseline (`docs/V2_GAMEPLAY_AUDIT.md`
§3, §3b) and from the intent of each tier. They are calibrated in M12.4 against the first pool of
generated v2 levels and again after human play (G1, G3). Changing one means editing this file and
`content/difficulty.ts` together; the tests keep them consistent.

## 1. Why v1 failed this test

v1's easiest-to-find strategy ("finish the charge") won 97% of its 60 levels, random play won 64%,
and at 88% of steps along the intended solution every legal move still won. A v2 level is only
accepted if simple, non-planning play does **not** win it, except in tutorial tiers where winning
easily is the point.

## 2. The eight simulated players

All are deterministic except `random`. Each acts only from the current state; none searches ahead
more than one action. "Legal" is §6 of the game design. Ties are broken by lower column index, then
lower slot index. A run is a loss if it loses or makes more than `3 × groups` actions.

| Id  | Name              | Rule                                                                                                                            |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `first-front`     | Tap-spam. Choose the leftmost legal column front; resume a waiting group only when no front is legal.                           |
| S2  | `tidy-left`       | Resume any legal waiting group first (lowest slot); otherwise the leftmost legal front.                                         |
| S3  | `tidy-right`      | As S2 but the rightmost legal front.                                                                                            |
| S4  | `largest`         | Choose the legal group (front or waiting) with the largest remaining capacity.                                                  |
| S5  | `smallest`        | Choose the legal group with the smallest remaining capacity.                                                                    |
| S6  | `random`          | Choose uniformly among legal actions. 200 seeded runs per level; the result is a success **rate**.                              |
| S7  | `most-delivered`  | Choose the legal action whose settled run delivers the most cubes.                                                              |
| S8  | `clears-capacity` | Among legal actions whose settled run completes the group, choose the one delivering the most; if none completes, behave as S7. |

S1 and S2/S3 are the "tap column 1, then column 2" repetition the brief warns about, in untidy and
tidy form. S7 and S8 are the cheap greedy players (S8 is the v1 "finish-the-charge" winner).

Per level the report records: for S1–S5, S7, S8 a win/loss; for S6 the win rate; and
`simpleWins` = how many of the seven deterministic players win.

Legitimate strategies are protected by construction: these players are not planners, and a level
is never penalised because a human (or the solver) finds a clever line. The gate only asks that
**cheap play does not win by itself**. Levels explicitly allowed to be easy (tutorial) are exempt.

## 3. Other measures

| Measure            | Definition                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `solutions`        | Number of distinct winning settled-sequential lines found by a bounded search (cap 64). Different action sequences count as distinct. |
| `winningShare`     | Winning leaves ÷ all leaves of the depth-limited legal-action tree (depth ≤ 6, sampled to ≤ 5,000 leaves).                            |
| `doomedFirstShare` | Fraction of legal first actions after which no winning line exists (verified with the solver).                                        |
| `reachableLoss`    | At least one loss (`slotsFull` or `deadlock`) is reachable by legal play (proved by search or witnessed by a player).                 |
| `peakSlots`        | Fewest slots `k ≤ K` for which the level is still solvable (`minSlots`); `slack = K − minSlots`.                                      |
| `recoveryDepth`    | For losses reached by S6 and S7: the fewest Undos back to a state from which a winning line exists. Reported as the 95th percentile.  |
| `planningDepth`    | Smallest `d ∈ 1..5` such that a depth-`d` lookahead player wins; its evaluation is `delivered + 2 × freeSlots`. `∞` if none within 5. |

## 4. Tiers

The tier of each level comes from the curve (M12.5), by global level number: tutorial 1–5, easy 6–15,
medium 16–30, hard 31+ (31–50 stress ordering decisions, 51+ add advanced combinations). Scheduled
breather levels may drop one tier. "—" means no requirement.

| Requirement                             | Tutorial                       | Easy        | Medium             | Hard             |
| --------------------------------------- | ------------------------------ | ----------- | ------------------ | ---------------- |
| `simpleWins` (of 7)                     | ≥ 5                            | 3–6         | ≤ 3                | ≤ 1              |
| S1 (`first-front`) wins                 | must win                       | —           | **must lose**      | **must lose**    |
| S2 and S3 both win                      | —                              | —           | —                  | **neither wins** |
| S8 (`clears-capacity`) wins             | —                              | —           | not both S7 and S8 | **both lose**    |
| `random` win rate                       | ≥ 0.80                         | 0.40 – 0.90 | 0.05 – 0.60        | ≤ 0.25           |
| `reachableLoss`                         | tutorial 1–3: **no**; 4–5: yes | yes         | yes                | yes              |
| `doomedFirstShare`                      | 0                              | ≤ 0.20      | 0 – 0.35           | 0.20 – 0.70      |
| `solutions` (distinct winning lines)    | ≥ 2                            | ≥ 2         | ≥ 2                | ≥ 1              |
| `winningShare`                          | —                              | —           | ≤ 0.50             | ≤ 0.25           |
| `slack` (`K − minSlots`)                | ≥ 2                            | ≥ 1         | ≥ 1                | ≤ 1              |
| `recoveryDepth` (95th percentile Undos) | ≤ 1                            | ≤ 2         | ≤ 3                | ≤ 5              |
| `planningDepth`                         | 1                              | 1 – 2       | 2 – 4              | 3 – 5            |

Meaning in words:

- **Easy tutorial puzzles** (first levels) teach the loop: most simple play wins, losing is
  impossible in the first three and recoverable with one Undo in the next two.
- **Medium** needs careful group selection: tap-spam (S1) must fail, cheap greedy play must not win
  on both measures, and random play usually fails but sometimes wins.
- **Hard** has meaningful dependencies and few spare slots: none of the tidy or greedy players win,
  random wins rarely, at most one slot of slack, and planning at least three actions ahead is needed.
- **Genuine dead ends**: every non-tutorial level has `reachableLoss` and a measurable
  `doomedFirstShare`, so poor choices truly cost the level.
- **Multiple solutions**: at least two distinct winning lines up to Medium, so players are not
  punished for a different valid idea; hard levels may have a single narrow line.
- **Fair recovery**: from losses cheap play reaches, Undo (or an earned booster, M14.4) gets back
  to a winnable position within the stated number of Undos, so a mistake costs a few moves, not the
  whole level.

## 5. How the checks run

1. For a candidate level, the pipeline runs S1–S8 (S6: 200 seeds) with the real engine.
2. It runs the solver for `solutions`, `minSlots`, `doomedFirstShare` and `reachableLoss`.
3. It samples losses from S6 and S7 for `recoveryDepth`, and lookahead players for `planningDepth`.
4. It compares everything with the level's tier. Any failing row rejects the candidate (M12.2 then
   tries another seed or arrangement) and the report (M12.6) shows which row failed.
5. CI repeats this for every shipped level; a level that no longer passes fails the build.

Repetition tests specifically required by the brief, as automated checks:

- `first-front` must lose every Medium and Hard level (column-spam).
- `tidy-left` and `tidy-right` must lose every Hard level (exhausting columns left to right or right to left).
- `largest` and `smallest` must not both win a Hard level, and must not both win more than half
  the Medium levels in a world (a world-level check, so one lucky level is tolerated).
- `random` rates must lie in the band for the level's tier.

## 6. Open points

- Whether `planningDepth` with this evaluation function is a stable, discriminating measure is
  decided in M12.4; if not it is replaced and the table updated.
- Calibration of every cell happens on real generated pools (M12.4/M12.6). The first human play
  (gate G1) may move bands more than any simulation.
- Special-mechanic levels (M13.4) may add rows for the new mechanic, never relax these.
