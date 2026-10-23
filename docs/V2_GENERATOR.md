# The v2 level generator (M12.2)

`packages/core/src/collect/generator.ts`. Given a finished picture it makes a level, deterministically
from a seed, and keeps only levels the solver can win and that have the structure its profile asks
for. The art library's preview levels (`npm run art:levels`) come from it.

## What it decides

The picture decides which colours are open at the start and which are buried (and how many rings
must be peeled). The generator decides everything else:

- **Groups:** how many cubes each group may carry. Each colour's cubes are split into groups of
  varied size around a target (the profile's group count against the picture's cube count); a small
  remainder joins the previous group so no group is tiny; sizes sum exactly to the colour's cubes.
- **Columns and order:** the groups are shuffled into 3 to 5 columns.
- **Slots:** the fewest holding slots that still allow a win (found by the solver) plus the
  profile's slack. `winnable(K)` is monotone in the slot count (a stall parks into the first free
  slot and slots matter only for the `slotsFull` loss), and the final level is solved again at its
  own slot count, so soundness does not rest on that.
- Squad 4, spawn gap 1 and field cap 3, fixed: the pace is a later design decision (M14).

## Profiles

| Profile    | Groups | Slack | Groups that must wait | Winnable openings | Doomed first moves | Random play must fail |
| ---------- | ------ | ----- | --------------------- | ----------------- | ------------------ | --------------------- |
| `gentle`   | 12     | +2    | at least 1            | at least 2        | none               | not asked             |
| `standard` | 16     | +1    | at least 2            | at least 1        | at most 50 %       | at least 15 %         |
| `tight`    | 20     | +0    | at least 3            | at least 1        | at most 75 %       | at least 40 %         |

"Groups that must wait" are groups whose capacity exceeds the cubes of their colour reachable when
the game opens. A first move "dooms" the level when no win remains after it. **Random play must fail**
is the share of 12 fixed-seed random settled-sequential playouts that do not win (`randomLoss`): a
cheap measure of how many pitfalls there are, as opposed to groups that merely wait.

## How a level is chosen

`generateLevel(art, id, name, { seed, profile, maxAttempts, budget, refineSteps })`:

1. **Deal** up to `maxAttempts` (default 12) candidates, each from a seed derived from the level
   seed and its attempt number (so each is reproducible alone). A candidate is **rejected** unless it
   is valid, enough groups must wait, the solver wins it within its node budget with at least the
   profile's fewest slots, and its first moves meet the profile (an unclassifiable first move rejects
   it: it never guesses).
2. **Refine** (profiles that ask for pitfalls): the best three acceptable candidates are improved by
   a **solver-guided hill climb** (`refineSteps`, default 24): swap or move groups, shift cubes
   between two groups of one colour, or merge them; a change is kept only if the solver can still win
   the level and random play fails at least as often. The slot count is held, so the pressure comes
   from the order and the sizes.
3. **Choose** the best-scoring result that meets every limit including `randomLoss`
   (`score`: fewest slots, dooming first moves, groups that wait, buried colours, a choice of
   openings and, most heavily, how often random play fails). Scores are not comparable across
   profiles. If nothing qualifies it returns `null`: a picture can be too shallow for a profile.

**Deterministic:** the same art, id, profile and seed give the identical level (tested, including
independence from earlier generations). Candidate seeds come from a chained 32-bit mixer; because the
engine's generator takes 32-bit seeds, two different (seed, attempt) pairs can in principle collide
(about 8 in 240,000 pairs), which only wastes an attempt. A seed must be an integer in 0 to 2^31 - 1.

## What it made for the six pieces (seed 1)

| Level            | Profile  | Cubes | Groups | Open / buried colours | Rings | Groups that must wait | Fewest slots | Slots | Doomed first moves | Random play fails |
| ---------------- | -------- | ----- | ------ | --------------------- | ----- | --------------------- | ------------ | ----- | ------------------ | ----------------- |
| crescent-moon    | gentle   | 312   | 12     | 3 / 0                 | 6     | 1                     | 1            | 3     | 0 of 3             | 0 %               |
| triple-moon      | gentle   | 328   | 11     | 3 / 0                 | 8     | 2                     | 1            | 3     | 0 of 3             | 0 %               |
| witchs-cauldron  | gentle   | 486   | 12     | 5 / 0                 | 10    | 7                     | 1            | 3     | 0 of 3             | 0 %               |
| amethyst-cluster | gentle   | 564   | 12     | 3 / 0                 | 6     | 4                     | 1            | 3     | 0 of 3             | 0 %               |
| libra-scales     | gentle   | 443   | 13     | 3 / 1                 | 4     | 3                     | 1            | 3     | 0 of 4             | 0 %               |
| black-cat        | standard | 575   | 17     | 2 / 3                 | 12    | 6                     | 1            | 2     | 0 of 4             | 42 %              |

(`npm run art:levels` tries `standard` first and falls back to `gentle`.)

## What this shows: structure comes from layered pictures

- **The black cat** (three buried colours: the cat is drawn over a moon) is the one picture that
  supports pitfalls. It reaches `standard` (random play fails 42 %), and `tight` too (random play
  fails every time at one slot). The tests check all three profiles on it.
- **The other five pieces** are essentially single-layer: every colour is open from the first move
  (the moons, the cauldron, the crystals) or nearly so (Libra has one buried colour). The generator
  tries hard on them (the profile climb at `standard` runs for several seconds each) and fails to
  make random play lose even once, so they fall back to `gentle`: solvable, with groups that wait, but
  with **no pitfalls**: the fewest slots is 1, no first move dooms the level, and random play never
  fails. A level cannot be harder than its picture allows.

So the generator does build structure on purpose when the picture has depth, but it cannot invent
depth. That is a finding for the art, not only for the generator: **a catalogue of single-layer
pictures will make easy levels however they are dealt**; layered pictures (a subject over a backdrop,
an object inside a frame) are what make the puzzle. M13.1 (authoring the world levels) and the art
catalogue should be planned with that in mind. Whether even the black cat's levels resist simple
strategies is what M12.3's simulated players will measure; `randomLoss` is only one cheap proxy.

## Cost

Candidates cost about 0.1 to 0.3 s each (solving is the cost). A `gentle` level takes about a second;
a profile with refinement takes about 5 s per picture whether it succeeds or not. All six pieces take
about 30 s in `npm run art:levels`, which runs offline; the game never generates at runtime.
