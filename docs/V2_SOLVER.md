# The v2 solver (M12.1)

`packages/core/src/collect/solver.ts`. It answers "can this level (or this position) still be won?"
under the real collection rules, and returns a line the live engine replays to a win. It replaces
the test-only `bruteSolve` as the thing M12.2 (generator), M12.3 (simulated players) and M12.4
(difficulty scoring) build on.

## What it does

| API                         | Answer                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `solve(level, budget?)`     | `solved` with a line, `unsolvable`, or `unknown` (budget ran out)                                |
| `new CollectSolver(budget)` | The same, with a cache shared across queries (`solve`, `solveState`, `verdict`, `size`, `clear`) |
| `solver.verdict(state)`     | `winnable`, `doomed` or `unknown` for any position, so M12.4 can measure dead ends               |
| `minSlots(level, budget?)`  | The fewest holding slots that still allow a win, with that line                                  |
| `replayLine(level, line)`   | Plays a line through the live `CollectSession`; throws if the engine refuses an action           |

## How it works

The model is the **settled-sequential** one of GAME_DESIGN_V2 §10: nodes are settled states, an edge is
one legal action (select a column front, or resume a waiting group) followed by ticks until settled.
The transition function **is the engine** (`apply` and `runUntilSettled`), so reachability,
blocking, partial groups, slots, summon order, re-entry of parked groups and both losses
(`slotsFull`, `deadlock`) are decided by the same code the player runs and are never
re-implemented. A solution is therefore a real winning play by construction, and a test replays every
line in the full engine.

Search is depth-first over a cache keyed by `stateKey` (which ignores tick, slot numbers and
routes, so reordered independent actions and equivalent parkings merge). Children are tried with
the most cubes delivered first. Results are cached across queries on one `CollectSolver`. A solver is bound to one level because
`stateKey` does not say which level a state is from (colours, slot count, group sizes): sharing a
cache between levels would be unsound, so `solveState` throws for a state that is not from the
solver's level.

**Budgets:** a query expands at most `budget` child states (default 20,000). When it runs out it
answers `unknown`; `unsolvable` and `doomed` are only ever reported for a fully explored subtree,
and an exhausted query caches nothing false (a later, larger budget on the same solver still
finds the win).

## What was checked

- Against the unmemoised brute-force reference (`bruteSolve(level, n, false)`) on 150 random small
  levels (about half tight, with plenty of unsolvable ones): same verdict every time, and every
  solved line replays to a win delivering every cube.
- On every fixture (A to E): solved, replayed in the full engine to a win.
- Genuine unwinnable positions: a level that has only dead ends, a lost position, and "doomed but
  not over" positions found on random tight levels (a first move that neither loses nor wins now,
  yet no win remains), each checked against the root verdict.
- Lines read out of a cache shared across queries: for states reached by random play on levels with
  2-4 slots, every line returned by `solveState` wins when applied to that state. (A first version
  stored a slot-indexed `resume` action under a key that ignores slot numbers and could return a
  line that the engine refused; the cache now stores the winning child's key and re-derives the
  action against the live state.)
- Budget and cache behaviour (`unknown` is never `unsolvable`, shared caches, determinism),
  `minSlots` against brute force, and `replayLine` refusing an illegal line.
- On the real review levels (`tools/collect/solver.test.ts`): the slice and all six art preview
  levels are solved, their lines replay to a win, and the recorded losing lines of the slice are
  reported unsolvable from where they end.

## What it shows about today's levels (`npm run solver:report`)

```
level                      cubes groups status      nodes     ms  minSlots
slice-moonlit-hat            196     13 solved          38     34  1
art-crescent-moon            312     14 solved          44     39  1
art-triple-moon              328     14 solved          38     13  1
art-witchs-cauldron          486     14 solved          38     21  1
art-amethyst-cluster         564     15 solved          41     22  1
art-libra-scales             443     15 solved          37     17  1
art-black-cat                575     16 solved          36     17  1
```

Every review level is solved in about 40 child states, i.e. the search barely has to look. That is
a finding, not a success: with the **fewest slots equal to 1** on every level, the holding slots
(2 on the slice, 4 on the art levels) are never a binding constraint, and a solver that wins with
almost no backtracking means these levels have little strategic depth. The art preview levels were
dealt by a bot search just to be playable (M11.5), so this is expected for them; for the slice it
agrees with the honest limit already written in `docs/V2_SLICE.md`. Quantifying it with simulated
players is M12.3, and levels that resist them are what M12.2 must generate.

## Limits

- **Settled-sequential play only.** A human can tap while familiars are still moving; the solver
  does not model concurrency. (Concurrent tapping can only add ways to lose: any winning settled
  line is still available to a human.)
- **Exhaustive, so exponential in the worst case.** The budget is the safety valve; large, deep
  levels with many equivalent-looking groups can come back `unknown`. None of today's levels does.
  Memory grows with the cache (one string per visited state); `clear()` drops it.
- **It proves winnability, not quality.** "Solved" says nothing about whether the level is
  interesting; that is the anti-triviality and difficulty work (M12.3 to M12.6).
- The test-only `bruteSolve` stays as the independent reference the solver is checked against.
