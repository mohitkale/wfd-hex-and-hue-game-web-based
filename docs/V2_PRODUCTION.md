# The production-level gate (M15.2)

Every level a player can reach on the v2 board without a dev flag is checked in CI and listed in one
committed report, [V2_PRODUCTION_REPORT.md](V2_PRODUCTION_REPORT.md).

```bash
npm run production:report   # rewrites the report
npm run production:check    # CI: exits 1 on a failure, or when the committed report is out of date
```

It sits beside the M12.6 gate ([V2_LEVEL_GATE.md](V2_LEVEL_GATE.md)), which holds the four levels that
can be placed on the difficulty curve to the full tier bands. This one answers a different question:
_is anything a player can reach broken, trivial, or inconsistent?_

## What counts as production

The tutorial levels, the slice, and every art piece's level (which is also the daily pool), plus any
`SHIPPED` piece (none yet; the 60 world slots, M13.1, are unfilled). Dev levels (`?level=dense`,
`big`, `swarm`, ...) are not production. A test requires every level the game can load by name (`DEV_LEVELS`) to be either in this list or in an explicit dev-only allowlist with a reason, so a new player-facing level cannot slip past the gate.

## What fails

| Failure         | Meaning                                                                                                                                                                                                  | Waivable                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `invalid`       | `validateCollectLevel` finds errors                                                                                                                                                                      | never                        |
| `unsolvable`    | the solver cannot win it, or its line does not win when replayed in the live engine                                                                                                                      | never                        |
| `inconsistent`  | an art level without subject or shades or with an id that is not its piece's, a board over 40×40, a level listed twice, or two ids for the same puzzle                                                   | never                        |
| `trivial`       | the cheap players (nine deterministic ones and 200 random runs, V2_STRATEGIES.md) fit a tier below what the kind of level needs: **slice** needs `medium`, **art** needs `easy`, **tutorial** needs none | only as a recorded deviation |
| stale deviation | a recorded deviation that no longer occurs                                                                                                                                                               | n/a: delete it               |
| stale report    | the committed report differs from a fresh run                                                                                                                                                            | n/a: regenerate              |

Deviations are keyed by the exact issue text and carry a reason (`KNOWN` in
`tools/collect/production.ts`). Today five of the six art levels carry one: single-layer pictures
cannot make decisions, so every cheap player wins them (V2_MEASURES.md). That is the known debt:
they stay playable, but need a layered redesign before they count as daily or world content. The
report says so rather than hiding it.

**Read PASS carefully.** Of the 11 levels, five art levels carry the recorded trivial deviation and
the sixth (`art-black-cat`) is only tutorial/easy grade. PASS means no level is broken, unsolvable
or newly trivial; it does not mean the daily pool is good.

## What stays human

The report lists, per level, what no tool can decide: first-time-player testing (M15.4, gate G3),
art review (`provenance.reviewed`), and whether tutorial-grade pictures belong in the daily pool.
Nothing in the report is, or may be recorded as, human approval.

## Regression

The gate is deterministic (seeded random players, no clock), so any engine change that alters a
production level's results changes the report and fails CI until the report is regenerated and
the change reviewed. Rule-level regressions are caught by the suites mapped in
[V2_TEST_MAP.md](V2_TEST_MAP.md).
