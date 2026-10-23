# Simulated players and the anti-triviality gate (M12.3)

Cheap, non-planning players that a level must not be beaten by (outside the tutorial and easy tiers).
`packages/core/src/collect/players.ts` implements the nine deterministic players and `random` of
[DIFFICULTY_V2.md](DIFFICULTY_V2.md) §2; `content/difficulty.ts` holds the bands;
`tools/collect/tierGate.ts` joins them into the gate the level pipeline enforces.

## The players

All act only at settled states, take one legal action, and the real engine runs until settled
(the settled-sequential model); none looks more than one action ahead and none uses the solver.
"List order" = column fronts by column, then waiting groups by slot.

| Player            | Rule                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `first-front`     | The first legal column front (a waiting group only if no front is legal)                       |
| `last-front`      | The last legal column front                                                                    |
| `round-robin`     | One from each column in turn, starting after the column used last                              |
| `tidy-left`       | Resume the first waiting group that can go, else the first front                               |
| `tidy-right`      | Resume a waiting group, else the last front                                                    |
| `largest`         | The action whose group has the most capacity left (ties: list order)                           |
| `smallest`        | The least capacity left                                                                        |
| `most-delivered`  | The action whose settled run delivers the most cubes (it does not avoid losing actions)        |
| `clears-capacity` | Among actions that complete their group, the one delivering most; if none, as `most-delivered` |
| `random`          | Uniform among legal actions; 200 runs on seeds 0..199, reported as a win rate                  |

A run of more than three actions per group counts as a loss for the win rate. It has not happened:
on the seven levels above the most any player needed was about 1.4 actions per group (a group can
park and be resumed, so the cap is a safety net, not a proof). `strategyReport(level)` returns each
player's result and loss reason, `simpleWins` (of nine), the random win rate, and whether any
player witnessed a loss.

## Results on today's levels (`npm run strategy:report`)

| level                | first-front | last-front | round-robin | tidy-left | tidy-right | largest   | smallest | most-delivered | clears-capacity | wins | random | tiers          |
| -------------------- | ----------- | ---------- | ----------- | --------- | ---------- | --------- | -------- | -------------- | --------------- | ---- | ------ | -------------- |
| slice-moonlit-hat    | deadlock    | slotsFull  | deadlock    | deadlock  | deadlock   | slotsFull | deadlock | deadlock       | deadlock        | 0    | 16 %   | medium, hard   |
| art-crescent-moon    | win         | win        | win         | win       | win        | win       | win      | win            | win             | 9    | 100 %  | tutorial       |
| art-triple-moon      | win         | win        | win         | win       | win        | win       | win      | win            | win             | 9    | 100 %  | tutorial       |
| art-witchs-cauldron  | win         | win        | win         | win       | win        | win       | win      | win            | win             | 9    | 100 %  | tutorial       |
| art-amethyst-cluster | win         | win        | win         | win       | win        | win       | win      | win            | win             | 9    | 100 %  | tutorial       |
| art-libra-scales     | win         | win        | win         | win       | win        | win       | win      | win            | win             | 9    | 100 %  | tutorial       |
| art-black-cat        | win         | slotsFull  | slotsFull   | win       | slotsFull  | win       | win      | win            | win             | 6    | 85 %   | tutorial, easy |

(`tiers`: which tiers' simple-player rules the level satisfies; a level can fit none, e.g. when the
random rate falls between two bands.)

## What this shows

- **Five of the six art levels are beaten by every cheap player and by random play every time.** They
  satisfy only the tutorial rules. This is not a dealing accident: the tier-targeted search below
  (24-step hill climbs on top of the generator's candidates) finds no easy or medium level for any of
  the moons, the cauldron, the crystals or the scales (all five were tried). Their pictures are single-layer: every colour is
  open from the first move, so any group order works (see docs/V2_GENERATOR.md).
- **The black cat** (colours buried behind others) is beaten by six of nine players (`last-front`,
  `round-robin` and `tidy-right` run out of slots) and by 85 % of random runs: an easy level.
  Searching for **medium** or **hard** within the search budget finds nothing for the cat either.
- **The hand-designed slice is beaten by none of the nine** and by 16 % of random runs: it satisfies
  the medium and hard player rules. That agrees with the slice's own test and note (no cheap
  strategy wins it from the start), and it shows the bar the generated levels have not reached.

So the gate does its job (it keeps cheap-play-beatable levels out of the tiers that forbid them),
and the generated pool is mostly tutorial-grade. Making medium and hard levels needs layered
pictures or hand design, not more shuffling.

## The gate (what the pipeline enforces)

- `checkStrategies(outcome, tier)` (content/difficulty.ts) applies the simple-player rules of a band:
  how many of the nine may win, who must win or lose, which pairs may not both win, the random win
  rate. Medium and hard levels that column-spam wins are rejected; tutorial and easy levels may be
  easy. `tiersSatisfied(outcome)` lists the fitting tiers. The tree measures (dead ends, slack,
  planning depth) are M12.4's and join `checkLevel`.
- `generateLevel(..., { gate })` takes the gate: the generator refines its best candidate until the
  gate has nothing to object to (fewest objections first; moves that change the slot count are gated
  at the slot count the final level will have) and never returns a level it still objects to; `tools/collect/tierGate.ts`'s `generateForTier` wires the tier's gate and profiles.
- `npm run art:levels` generates each art level for its target tier (`black-cat`: easy, the rest
  tutorial), records the players' results and the tier in the committed data, and a test recomputes
  them and checks the recorded tier's band, so a level that stops meeting it fails the build. The CI
  gate over every shipped level, with the world-level repetition check, is M12.6.
- The gate covers the **simple-player** rules only. A band's other rules (the reachable-loss rule,
  dead ends, slack, planning depth) arrive with M12.4 and join `checkLevel`; the black cat labelled
  easy has a witnessed loss, but nothing here checks that it must.
- The players judge cheap play only. A level is never penalised because a human or the solver finds
  a clever line: a hard level beaten by no cheap player is accepted however winnable it is.

## Cost and limits

`strategyReport` takes about 0.5 s per level (the 200 random runs dominate). A tier-gated search
costs 15 to 35 s per picture and tier, so the six art levels take about 35 s to regenerate.
Concurrent tapping is not simulated (a human can tap during motion; this can only add ways to lose).
`witnessedLoss` is a lower bound on reachable losses: the solver's tree (M12.4) settles it.
