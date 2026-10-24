# v2 gameplay test map (M15.1)

Where each area of the v2 rules is tested. M15.1 added the cross-cutting rows (`conformance.test.ts`,
`v1Saves.test.ts`); the rest were written with their milestones. Every bug found later gets a
regression test next to the module it lives in.

| Area                                                                                                  | Tests                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Collection rules, edge cases R-01…R-20                                                                | `core/collect/rules.test.ts`, `sim.test.ts`, `grid.test.ts`, `groups.test.ts`                            |
| Simultaneous collectors, one cube each                                                                | `conformance.test.ts` ("simultaneous collectors"), invariants after every tick (`invariants.ts`)         |
| Counts: board + carried + delivered = total; group sums                                               | `conformance.test.ts` (44 levels, every tick)                                                            |
| No duplicate or teleported pickups                                                                    | `conformance.test.ts`, `rules.test.ts` ("no invisible or teleported pickups")                            |
| Slots: parking, resume, overflow, fixtures A–E                                                        | `slots.test.ts`, `sim.test.ts`                                                                           |
| Deadlock and `slotsFull` losses, frozen after a loss                                                  | `rules.test.ts`, `conformance.test.ts` (both outcomes reached, finished game never changes)              |
| Win/loss exclusive and final                                                                          | `conformance.test.ts`                                                                                    |
| Wax seals                                                                                             | `seals.test.ts`                                                                                          |
| Undo (exact: a, b, undo, c = a, c)                                                                    | `session.test.ts`, `boosters.test.ts`, `conformance.test.ts`                                             |
| Boosters: Extra Slot, revive, Hint, charging, economy                                                 | `boosters.test.ts`, `game/collect/boosterUse.test.ts`, `pouch.test.ts`                                   |
| Save and resume: mid-game JSON state restores tick for tick                                           | `state.test.ts` (`fromJSON`), `conformance.test.ts` ("resume from a saved state", corrupt state refused) |
| Deterministic replay of an action log                                                                 | `session.test.ts`, `conformance.test.ts`                                                                 |
| Saves: v1 save formats (mid-game, unversioned, damaged, newer build) load; v2 stores never touch them | `game/collect/v1Saves.test.ts`, `game/save/save.test.ts`                                                 |
| v2 stores: spellbook, daily, tutorial, pouch survive broken storage                                   | `dailyBook.test.ts`, `pouch.test.ts`, `tutorial.test.ts`                                                 |
| 1× / 2×: speed never changes outcomes, the ad rule                                                    | `game/collect/speedRule.test.ts`, `swarm.test.ts`                                                        |
| Analytics: consent gate, no PII                                                                       | `game/collect/gameplayTracker.test.ts`                                                                   |
| Solver and generator soundness                                                                        | `solver.test.ts`, `generator.test.ts`, `random.test.ts`                                                  |

## Limits to know

- The v1 save fixtures are written to the shipped v1.0.0 schema (`save/schema.ts`), not exported from
  a live browser; real saves go through the same `migrate`.
- There is no mid-level "save and resume" in the product: an unfinished attempt is not stored.
  Resume is therefore tested at the state level (`toJSON`/`fromJSON`) and by log replay, which is
  what a future resume feature would use. After an Extra Slot the log alone does not replay on the
  plain level (see `CollectSession.log`).
- Rendering is not covered here (Phaser, thin by design); it is checked in the browser (M15.3/M15.4).
