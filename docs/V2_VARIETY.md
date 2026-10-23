# Puzzle variety: wax seals (M13.4)

The roadmap asks to evaluate the candidate mechanics (locked fragments, barriers, order constraints,
timed portals, limited assistance) and add **at most one**, with solver and generator support, a
tutorial and tests. The rule is in `docs/GAME_DESIGN_V2.md` §4b; this file is the evaluation and the
evidence.

## 1. Why a mechanic at all

M12 found that generated levels are mostly tutorial-grade: a single-layer picture gives groups little
to wait for, so cheap strategies win (`docs/V2_STRATEGIES.md`). Hand-built layered pictures fix that
but are slow to make. The question for a new mechanic is therefore concrete: **does it create real
decisions on a picture that has none, without a new way to block play?**

## 2. The candidates

| Candidate                                                                                       | Creates decisions on a flat picture?                                                                                                     | Understandable                  | Solver and state cost                                    | Verdict                                                         |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| **Locked fragments (wax seals)**: some cubes cannot be fetched until a key colour is finished   | **Yes**: measured below                                                                                                                  | One sentence and a visible mark | None: seal state is a function of the existing state key | **Chosen**                                                      |
| Locked colours: a whole colour unselectable until a key is done (tried first, built and tested) | **No**: all nine simple strategies still won 9/9 and random play 100% on the same pictures. It only removes options; nothing can run dry | Yes                             | None                                                     | Rejected after measuring                                        |
| Order constraints (group B only after group A)                                                  | No, for the same reason: a legality rule that removes options                                                                            | Yes                             | Small                                                    | Rejected (same finding)                                         |
| Barriers (permanent walls)                                                                      | Little: a wall reshapes geometry the cubes already create, and the picture would never be fully cleared                                  | Yes                             | Reachability and the reveal change                       | Rejected                                                        |
| Timed portals                                                                                   | n/a                                                                                                                                      | n/a                             | n/a                                                      | **Excluded by the product rules** (no timers, never block play) |
| Limited assistance (hints, helpers)                                                             | It is a booster, not a puzzle rule; M14.4 owns boosters                                                                                  | n/a                             | n/a                                                      | Out of scope here                                               |

The deciding observation is that a rule only matters if it can **trap**. In this game traps come from
a group running dry with capacity left, so it must wait in one of the few slots. Seals on _part_ of a
colour make exactly that happen on any picture: the group delivers the unsealed cubes, then waits
until the key colour is gathered.

## 3. The rule

A level may seal individual cubes with a key colour. A sealed cube stays on the board and blocks, but
cannot be fetched until every group of the key colour has completed. Exact wording, validation and
invariants: `GAME_DESIGN_V2.md` §4b. Player-facing: a small square in the key colour on a darkened
cube; tapping a group whose reachable cubes are all sealed says "Wax-sealed: finish the key colour
first"; the first sealed level of a visit shows "Wax-sealed cubes wake once their key colour is
gathered".

## 4. Evidence

**Solver.** Seal state needs no new solver state. Checked, not just argued: on 120 random small sealed
levels the memoised solver gives the same verdict as the unmemoised brute-force search, every winning
line replays to a win in the live engine, and a seal turns a solvable level unsolvable in some cases
(so it is a real constraint). Engine invariants (`violation`, including "no reserved cube is sealed") hold after every tick of
whole sealed games played with random legal moves, also on cloned states.

**Generator.** `generateLevel(art, id, name, { seals: n })` seals part (a third to six tenths) of `n`
colours, keeps a candidate only if the solver can win it **and** a sealed cube is reachable at the
opening. With `seals: 0` (the default) the code path is the old one: the evidence that nothing
changed is that the committed level JSON is still current (a test fails if it is not) and every
existing generator test passes; a separate test checks `seals: 0` equals omitting it. Seals use their
own random stream.

**Effect on real pictures** (`npm run seals:report`; gentle profile, seed 1, nothing tuned):

| picture          | sealed colours | sealed cubes (at opening) | min slots | simple players that win | random wins | difficulty score |
| ---------------- | -------------- | ------------------------- | --------- | ----------------------- | ----------- | ---------------- |
| crescent-moon    | 0              | 0 (0)                     | 1         | 9/9                     | 100%        | 3.33             |
| crescent-moon    | 1              | 110 (35)                  | 1         | 6/9                     | 74%         | 3.33             |
| crescent-moon    | 2              | 47 (37)                   | 2         | 6/9                     | 40%         | 7.61             |
| triple-moon      | 0              | 0 (0)                     | 1         | 9/9                     | 100%        | 3.33             |
| triple-moon      | 1              | 143 (28)                  | 1         | 1/9                     | 14%         | 45.09            |
| triple-moon      | 2              | 154 (31)                  | 2         | 0/9                     | 2%          | 38.31            |
| witchs-cauldron  | 0              | 0 (0)                     | 1         | 9/9                     | 100%        | 3.33             |
| witchs-cauldron  | 1              | 29 (12)                   | 1         | 9/9                     | 100%        | 3.33             |
| witchs-cauldron  | 2              | 43 (7)                    | 2         | 9/9                     | 89%         | 5                |
| amethyst-cluster | 0              | 0 (0)                     | 1         | 9/9                     | 100%        | 3.33             |
| amethyst-cluster | 1              | 211 (55)                  | 1         | 3/9                     | 38%         | 14.91            |
| amethyst-cluster | 2              | 55 (24)                   | 3         | 0/9                     | 4%          | 66.91            |
| libra-scales     | 0              | 0 (0)                     | 1         | 9/9                     | 100%        | 5.83             |
| libra-scales     | 1              | 201 (65)                  | 1         | 7/9                     | 82%         | 5.83             |
| libra-scales     | 2              | 38 (24)                   | 2         | 9/9                     | 100%        | 7.5              |
| black-cat        | 0              | 0 (0)                     | 2         | 9/9                     | 100%        | 11               |
| black-cat        | 1              | 271 (40)                  | 3         | 0/9                     | 7%          | 28.17            |
| black-cat        | 2              | 271 (33)                  | 5         | 0/9                     | 10%         | 24.22            |

On five of six pictures a seal takes cheap strategies from always winning to losing often. That is the
decision-making the flat pictures lacked, and every row is a level the solver can win.

## 5. Tutorial and UI

- `?engine=v2&level=seals` ("Wax Seals", `levels.ts`): all the gold is sealed by violet. The first tap
  on gold is refused with the reason, violet is open, and finishing violet visibly lifts the seals.
  One lesson, no trap: there is exactly one line (violet, then gold), checked with the solver.
- Seals are painted into their own RenderTexture over the cubes and redrawn only when a seal lifts
  (a key colour's last group completes), so there is no per-frame cost.
- The toast now wraps to the board width, so the longer messages fit narrow phones.

## 6. Not done, and open

- **Not tuned.** The seed-1 levels above range from "nothing changed" (cauldron) to nearly
  unwinnable by chance (triple moon: 2% of random runs). Seals are not yet in any shipped level, the
  tier gate (`tierGate.ts`), the difficulty curve or the pool: using them in the catalogue means
  choosing seal counts per tier and re-running the M12.6 gate. That is level design, not engine work.
- **The measures do not model seals.** `peel`-based "hidden colours" and the difficulty score ignore
  them (the table shows the score unchanged for some sealed levels while simple players start losing),
  so do not trust the score for a sealed level until the measures learn about seals.
- **Generation cost.** With seals on, each attempt evaluates up to six variants (about six times the
  solver work); asking for more sealed colours than the picture has gives `null`.
- **Colour only.** The mark is the key colour's square; the colour-blind mode (`?cb=1`) marks familiars
  but not seals. The refusal text helps, but a shape on the mark would be better.
- **No on-device check.** Browser-pane check only (tutorial level, refusal toast, lifting seals at
  375×812). 60 fps with many sealed cubes is unmeasured (M15.3).
- Seals are not in the compact art-level encoding (`artLevelCodec`): generated preview levels carry
  none. A level that ships seals needs that codec extended.
