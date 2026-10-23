# The v2 difficulty curve (M12.5)

What each stretch of levels teaches, and the machine-checkable bands that follow. The data is
`content/curveV2.ts`; a test parses the table below and fails if it differs from the code. The
bands per tier (cheap-player rules, tree measures) are [DIFFICULTY_V2.md](DIFFICULTY_V2.md) §5; the
score is [V2_MEASURES.md](V2_MEASURES.md). **Numbers are provisional**: they are calibrated on real
pools of generated levels (M12.6) and on human play (G3). The level-to-tier mapping of the
difficulty document is now defined by this curve.

## The stages

| Stage                           | Levels | Tier     | Score  | Requires                                                           |
| ------------------------------- | ------ | -------- | ------ | ------------------------------------------------------------------ |
| Learn collection                | 1–5    | tutorial | 0–20   | nothing beyond the tier                                            |
| Blocked colours and slots       | 6–15   | easy     | 8–35   | hiddenColors ≥ 1; deadEndShare 0.02–0.3                            |
| Partial groups and dependencies | 16–30  | medium   | 20–55  | hiddenColors ≥ 1; deadEndShare 0.05–0.5                            |
| Ordering decisions              | 31–50  | hard     | 35–75  | deadEndShare 0.15–0.7; temptingPoorShare ≥ 0.02; planningDepth 3–5 |
| Advanced combinations           | 51+    | hard     | 50–100 | deadEndShare 0.15–0.7; temptingPoorShare ≥ 0.05; planningDepth 3–5 |

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

- The score never reads length (`seconds`, `cubes` and failure rates are not inputs), and a stage
  requirement may not name a length measure (a test enforces it).
- Every level of every stage has the same caps: at most **420 s** (the settled-sequential upper
  bound) and **700 cubes**.
- A stage's mean length may be at most **1.5x** the previous populated stage's, in seconds and in
  cubes: difficulty may not creep up by making levels longer.
- A world's stages must rise: each populated stage's mean score must beat the previous populated
  stage's by at least **3 points**.
- The world-level repetition caps of DIFFICULTY_V2 §5 apply (no one cheap player may win most of a
  tier's levels).

## What the curve is, relative to the tier bands

The curve is **a layer on top of** the tier bands, not a replacement. Its requirements are never
looser than the tier's band for the measures both name (a test checks it: dead ends, planning
depth), but it checks fewer things: the full band of DIFFICULTY_V2 §5 (`checkLevel`: free steps,
solution count, slack, recovery depth, random win rate...) is the quality gate of M12.6. A level can
therefore be **on the curve and still fail its tier's full band** (none of the generated levels meets a
full band: V2_MEASURES.md). The tiers themselves come from one mapping, `tierForLevel`
(difficulty.ts); the stages take their tier from it and a test checks it changes only at stage
boundaries.

## What reads the curve

- `art:levels` (`tools/art/levels.ts`) generates each placed piece for its stage's tier and **throws if
  the generated level deviates from the curve** (`checkEntry`), so the committed data cannot hold
  a deviating placed level. Placement is in `tools/art/placement.ts`.
- `checkEntry(entry)` lists every way one level deviates (the tier's cheap-player rules, the loss
  rule, the score band, the requirements, the length caps); `checkCurve(entries)` adds unique level
  numbers, rising stages, the length step and the world caps.
- A test runs `checkCurve` over the placed levels.
- **Not yet consumed:** there is no shipped world (M13.1), so no world is checked end to end, and
  the M12.6 report and CI gate will run `checkCurve` and `checkLevel` over every shipped level.

## Where the library sits today

| Level | Piece             | Score | Buried colours | Reachable loss | Cubes | Seconds (upper bound) |
| ----- | ----------------- | ----- | -------------- | -------------- | ----- | --------------------- |
| 1     | crescent-moon     | 3.3   | 0              | no             | 312   | 137                   |
| 2     | triple-moon       | 3.3   | 0              | no             | 328   | 126                   |
| 3     | witchs-cauldron   | 3.3   | 0              | no             | 486   | 253                   |
| 16    | slice-moonlit-hat | 40.3  | 3              | yes            | 196   | 82                    |

- **Three generated pieces fit stage 1** (levels 1 to 3, lossless).
- **The hand-designed slice fits stage 3** at level 16: score 40.3 is inside the medium band, every
  cheap player loses it, it has buried colours and a dead end rate of 0.15. It misses stage 4
  because its planning depth is 2, not 3. (An earlier draft of this page said it fit no stage;
  that was wrong.) So the curve is reachable by hand design; it is the generator that is not there yet.
- **Three generated pieces cannot be placed.** Amethyst and Libra are tutorial-grade and lossless, and
  levels 4 and 5 need a loss; the black cat is easy for the cheap players (they win 6 of 9) but has
  no dead end along its winning line, which stage 2 and the easy band require. So **no generated
  level reaches stage 2 or later**. The catalogue the roadmap plans (M13.1) needs layered
  pictures, or hand-designed levels like the slice, to fill levels 6 and up.

## Limits

- The numbers are first guesses, calibrated on seven measured levels (the slice and the six art
  levels; none is a generated stage 3 to 5 level). M12.6 pools and human play (G3) must tell whether
  they separate real stages.
- "Requires" are small floors and ceilings; passing them does not make a good level.
- Special-mechanic levels (M13.4) may add stages or requirements, never relax these.
