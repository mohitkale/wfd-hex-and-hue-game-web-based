# The v2 level generator (M12.2)

`packages/core/src/collect/generator.ts`. Given a finished picture it makes a level, deterministically
from a seed, and keeps only levels the solver can win and that have the structure its profile asks
for. The art library's preview levels (`npm run art:levels`) now come from it, replacing the
bot-dealing of M11.5.

## What it decides

The picture decides which colours are open at the start and which are buried (and how many rings
must be peeled). The generator decides everything else:

- **Groups:** how many cubes each group may carry. Each colour's cubes are split into groups of
  varied size around a target (the profile's group count against the picture's cube count), none
  tiny, summing exactly to the colour's cubes.
- **Columns and order:** the groups are shuffled into 3 to 5 columns (varied ordering).
- **Slots:** the fewest holding slots that still allow a win (found by the solver) plus the
  profile's slack, so slot pressure is set from the level, never guessed.
- Squad 4, spawn gap 1 and field cap 3, fixed: the pace is a later design decision (M14).

## Profiles

| Profile    | Groups | Slack | Groups that must wait | Winnable openings | Fewest slots | Doomed first moves |
| ---------- | ------ | ----- | --------------------- | ----------------- | ------------ | ------------------ |
| `gentle`   | 12     | +2    | at least 1            | at least 2        | at least 1   | none               |
| `standard` | 16     | +1    | at least 2            | at least 1        | at least 1   | at most 50 %       |
| `tight`    | 20     | +0    | at least 3            | at least 1        | at least 2   | at most 75 %       |

"Groups that must wait" are groups whose capacity exceeds the cubes of their colour reachable when
the game opens, so they cannot finish straight away and have to park or be resumed. A first move
"dooms" the level when no win remains after it (the solver says so, or it loses at once).

## How a level is chosen

`generateLevel(art, id, name, { seed, profile, maxAttempts, budget })` tries up to `maxAttempts`
(default 12) candidates. Candidate `k` is dealt from a seed derived from the level seed and `k`, so
each is reproducible on its own. A candidate is **rejected** unless: it is a valid level; enough
groups must wait; the solver finds a win within its node budget with at least the profile's fewest
slots; and its first moves meet the profile (an unclassifiable first move rejects the candidate: it
never guesses). Of the acceptable candidates the highest `score` wins (more slots needed, more
dooming first moves, more waiting groups, more buried colours, a choice of openings), the earliest on
ties. If none is acceptable it returns `null`: a picture can simply be too shallow for a profile.

**Deterministic:** the same art, id, profile and seed give the identical level (tested, including
independence from earlier generations). The solver is deterministic too.

## What it made for the six pieces (seed 1)

| Level            | Profile  | Cubes | Groups | Open / buried colours | Rings | Groups that must wait | Fewest slots | Slots | First moves (winnable / dooming) | Score |
| ---------------- | -------- | ----- | ------ | --------------------- | ----- | --------------------- | ------------ | ----- | -------------------------------- | ----- |
| crescent-moon    | gentle   | 312   | 12     | 3 / 0                 | 6     | 1                     | 1            | 3     | 3 (3 / 0)                        | 1.25  |
| triple-moon      | gentle   | 328   | 12     | 3 / 0                 | 8     | 2                     | 1            | 3     | 3 (3 / 0)                        | 1.5   |
| witchs-cauldron  | standard | 486   | 18     | 5 / 0                 | 10    | 7                     | 1            | 2     | 4 (4 / 0)                        | 2.75  |
| amethyst-cluster | standard | 564   | 15     | 3 / 0                 | 6     | 3                     | 1            | 2     | 4 (4 / 0)                        | 1.75  |
| libra-scales     | standard | 443   | 18     | 3 / 1                 | 4     | 3                     | 1            | 2     | 3 (3 / 0)                        | 2.25  |
| black-cat        | standard | 575   | 16     | 2 / 3                 | 12    | 5                     | 1            | 2     | 3 (3 / 0)                        | 3.75  |

All six are solver-verified (their lines replay to a win) and meet their profile. The `standard`
profile was tried first and `gentle` is the fallback; the crescent and triple moon could only
support `gentle`.

## An honest finding: structure is thin

Look at the table: **the fewest slots is 1 for every piece and no first move dooms a level.** The
generator does what it was asked (valid, solvable, groups that wait, slot counts from the solver),
but random dealing of a finished picture rarely creates a position where the player can go wrong:
the open colours let you clear almost anything, and one holding slot is always enough. Asking for
more (`tight`: two slots needed, many waiting groups) succeeds on only some pictures (the black cat
in a couple of seeds) and not on the others within 12 candidates. So these levels are checked
for solvability and for having groups that wait, **not** for being hard, and not yet for resisting
simple strategies. That is the next task: M12.3's simulated players will say how often cheap play
wins them, and M12.2's generator is where a smarter, solver-guided deal (building dependencies on
purpose instead of shuffling) would go if they turn out to be easy.

## Cost

About 0.3 s per candidate for a 300 to 575 cube picture (solving is the cost), so generating one
level takes a few seconds; the six pieces take about 5 s together. It runs offline
(`npm run art:levels`); the game never generates at runtime.
