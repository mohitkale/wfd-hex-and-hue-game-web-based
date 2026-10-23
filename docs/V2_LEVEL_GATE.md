# The v2 level quality gate and report (M12.6)

Every v2 level that is meant to ship must pass one gate in CI, and there is one report to read why.

```bash
npm run levels:report   # writes dist/levels-report.html (open it in a browser)
npm run levels:check    # the gate: exits 1 on any failure; a step in `npm run verify` and in the CI workflow
```

(The CI workflow lists its steps itself rather than calling `verify`: `art:check` (M11.4) and `levels:check`
were added there in this task, since `art:check` had only been in `verify`.)

## What the report shows

For each level of the pool (`content/poolV2.ts`): id and name, its picture, cube / colour / group /
slot counts, the **winning line** the solver found (replayed to a win in the engine), the **difficulty
score with every component**, what each of the nine cheap players did and the random win rate,
the estimated duration (a settled-sequential upper bound), and every issue found. A banner at
the top says PASS or FAIL and lists the failures.

## What fails the gate

| Failure      | Meaning                                                                                                                           | Can it be waived?                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `unsolvable` | The solver proves the level cannot be won, cannot decide it within its budget, or its line does not win when replayed             | Never                              |
| `trivial`    | Cheap play beats the level where its tier forbids it (column-spam must lose medium and hard; the band's other cheap-player rules) | Never                              |
| `band`       | Outside its tier's full band (DIFFICULTY_V2 §5: dead ends, free steps, solutions, slack, recovery, planning depth, ...)           | Only as a recorded known deviation |
| `curve`      | Off the difficulty curve (V2_CURVE.md: score band, stage requirements, loss rule, length caps)                                    | Only as a recorded known deviation |
| `world`      | One cheap player wins most of a tier's levels across the pool                                                                     | Only as a recorded known deviation |
| `waiver`     | A recorded deviation **no longer occurs**: remove it                                                                              | n/a                                |
| pool         | A level id or number listed twice                                                                                                 | Never                              |

A level's tier comes from its **level number** on the curve (`tierForLevel`), so the number in
`poolV2.ts` decides which band it is held to.

## Known deviations: today's debt, in the open

`content/poolV2.ts` records each accepted deviation with its exact message and a reason that says what
removes it. Without this the gate could not pass on today's levels, because **no generated level meets a
full tier band** (V2_MEASURES.md). With it, the debt is explicit and exact: a new deviation fails, and
a deviation that goes away must be deleted from the list. Today the pool is:

| Level | Piece             | Tier     | Recorded deviations                                                                                                                |
| ----- | ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1     | crescent-moon     | tutorial | `solutions 1 outside 2..∞` (one kind of winning line)                                                                              |
| 2     | triple-moon       | tutorial | the same                                                                                                                           |
| 3     | witchs-cauldron   | tutorial | the same                                                                                                                           |
| 16    | slice-moonlit-hat | medium   | `doomedFirstShare 0.67`, `freeStepShare 0.86`, `solutions 1`, `winningShare 1` (hand-designed, harsher opening than medium allows) |

Not in the pool: the amethyst cluster, Libra and the black cat (they cannot be placed on the curve:
V2_CURVE.md), and every other generated level. A level is shipped only by being in the pool and
passing; nothing is shipped yet (`SHIPPED` in `content/v2art` is empty).

## Tests

`tools/collect/levelGate.test.ts` checks a **good fixture** (fixture B with room for every waiting
group, which meets the whole tutorial band with no recorded debt) passes with exit 0, and **bad
fixtures** fail with exit 1: an unsolvable level, a trivial level (column-spam beats it at a medium
number, and listing the message does not waive it), an out-of-band level without its recorded
deviation, a recorded deviation that no longer occurs, duplicate ids and numbers, a world where one
cheap player wins every medium level; plus the report's content and escaping and that the real pool
passes with every recorded deviation reasoned.

## Limits

- The pool is small (four levels) because no more exist that can be placed on the curve.
- The gate measures with the settled-sequential tree and the solver budgets of V2_MEASURES.md; a level
  that needs more is reported as not decided, and fails.
- It checks structure and cheap play, not whether a level is fun: that is G3 (human play).
