# The v2 difficulty curve (M12.5)

What each stretch of levels teaches, and the machine-checkable bands that follow. The data is
`content/curveV2.ts`; a test parses the table below and fails if it differs from the code. The
bands per tier (cheap-player rules, tree measures) are [DIFFICULTY_V2.md](DIFFICULTY_V2.md) §5; the
score is [V2_MEASURES.md](V2_MEASURES.md). **Numbers are provisional**: they are calibrated on real
pools of generated levels (M12.6) and on human play (G3). The level-to-tier mapping of the
difficulty document is now defined by this curve.

## The stages

| Stage                           | Levels | Tier     | Score  | Requires                                                         |
| ------------------------------- | ------ | -------- | ------ | ---------------------------------------------------------------- |
| Learn collection                | 1–5    | tutorial | 0–20   | nothing beyond the tier                                          |
| Blocked colours and slots       | 6–15   | easy     | 8–35   | hiddenColors ≥ 1                                                 |
| Partial groups and dependencies | 16–30  | medium   | 20–55  | hiddenColors ≥ 1; deadEndShare ≥ 0.02                            |
| Ordering decisions              | 31–50  | hard     | 35–75  | deadEndShare ≥ 0.05; temptingPoorShare ≥ 0.02; planningDepth ≥ 2 |
| Advanced combinations           | 51+    | hard     | 50–100 | deadEndShare ≥ 0.1; temptingPoorShare ≥ 0.05; planningDepth ≥ 3  |

- **What each teaches:** 1–5 the loop (levels 1–3 can never be lost, 4 and 5 introduce a loss, the
  holding slots); 6–15 a colour buried under others and waiting groups; 16–30 a group too big for
  what is open, so what to clear first is a decision; 31–50 which group first and which can wait
  (choices that look good and are not); 51+ all of it with little slack.
- **Score** is the decision score of V2_MEASURES.md (0–100); the band is the range a level of the stage
  must fall in. Bands overlap on purpose, so a level may sit a little under or over its neighbours.
- **Requires** are decisions the stage must contain (measures of V2_MEASURES.md); they fail a level
  that reaches the right score by the wrong means.
- Each level is also checked against its stage's **tier**: the cheap players must behave as the tier's
  band demands (column-spam must lose from stage 3 on), tutorial levels 1–3 must have no reachable
  loss and levels 4–5 one, and every later stage needs a reachable loss.

## Difficulty rises through decisions, not length

- The score never reads length (`seconds`, `cubes`, failure rates are not inputs).
- Every stage shares the same length cap: a level may take at most **420 s** (the settled-sequential
  upper bound) and have at most **700 cubes**.
- A world's stages must rise: each populated stage's mean score must beat the previous populated
  stage's by at least **3 points**.

## What the pipeline does with it

- `checkEntry(entry)` lists every way one level deviates (tier rules, loss rule, score band,
  requirements, length caps); `checkCurve(entries)` adds unique level numbers and the rising stage
  means. A deviation fails the build.
- `tools/art/levels.ts` takes each placed piece's target tier from its level number
  (`PREVIEW_LEVEL`), and a test runs `checkCurve` over the placed levels.

## Where the art library sits today

| Level | Piece           | Score | Buried colours | Reachable loss | Cubes | Seconds (upper bound) |
| ----- | --------------- | ----- | -------------- | -------------- | ----- | --------------------- |
| 1     | crescent-moon   | 3.3   | 0              | no             | 312   | 137                   |
| 2     | triple-moon     | 3.3   | 0              | no             | 328   | 126                   |
| 3     | witchs-cauldron | 3.3   | 0              | no             | 486   | 253                   |
| 6     | black-cat       | 11    | 3              | yes            | 575   | 266                   |

These four pass the curve. **Two pieces cannot be placed**: the amethyst cluster and Libra are also
tutorial-grade pictures with no reachable loss, and the first stage has only three lossless slots
(1–3) while levels 4 and 5 need a loss that none of them can produce. And **nothing reaches stage 3
or later**: the generator cannot make decisions out of a picture that has none (V2_GENERATOR.md,
V2_STRATEGIES.md), and the black cat, the only picture with buried colours, tops out at an easy
level with a score of 11. The curve therefore shows a gap, not a result: the catalogue the roadmap
plans (M13.1) needs layered pictures to fill levels 16 and up, or hand-designed levels like the
slice (score 40, which fits stage 4's score band but does not meet its player rules or its
requirements, because it was not designed against this curve).

## Limits

- The numbers are first guesses. The score bands in particular rest on seven measured levels.
- "Requires" thresholds are small and mostly floors; whether they separate real stages is what the
  M12.6 pool and human play must tell.
- Special-mechanic levels (M13.4) may add stages or requirements, never relax these.
