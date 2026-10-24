# Moving from v1 to v2 (M15.5)

What happens to a player's saves when the site switches to the v2 game, and how to go back.

## Principle

**The import never rewrites or deletes the v1 save.** v1 keeps its save (`hexhue.save`, format
version 1, in IndexedDB or `localStorage`); v2 keeps its own small books (`hexhue.v2.*` in
`localStorage`). The one thing v2 does write into the v1 save is the shared **settings** (sound, music,
vibration, colour symbols, reduced motion) when the player changes them in the v2 Menu. Levels, stars,
coins, boosters and tips in it are never touched, so a rollback to v1 loses no progress.

## What carries over (once, automatically)

The first time a v1 player who has actually played (`stats.plays > 0` or any level cleared) opens v2:

| v1                     | v2                                        |
| ---------------------- | ----------------------------------------- |
| coins                  | coins, all of them                        |
| Undo                   | Undo                                      |
| +1 Slot                | Extra Slot                                |
| Shuffle and Magic Wand | Hint, one for each (neither exists in v2) |

A short "Welcome back" note says so. Rules (`packages/game/src/collect/importV1.ts`, tested with the v1
fixtures in `packages/game/src/save/fixtures/` and the damaged `__proto__` case):

- **Once**: the v2 pouch records `imported: true`; a spent balance is never topped up again.
- **Never over v2 progress**: if the v2 pouch has already been changed (coins earned or spent, a
  booster used, a level paid), it is kept and only marked as handled.
- **A v1 save that was never played carries nothing** and is not marked, so a later v1 session can
  still be carried over.
- Counts are validated by `migrate` first, so a damaged v1 save cannot produce a negative or
  fractional balance.

## What does not carry over

- **Levels, stars and skipped levels**: v1's 60 levels are a different game; v2's progress is the
  Spellbook, the daily book and the tutorial book.
- **Tips seen**: v2 teaches with its own tutorial, which is still offered to everyone (v2 plays
  differently).
- Settings need no migration: sound, music, vibration, colour symbols and reduced motion are the same
  `Settings` object the v2 Menu edits.

## Rolling back

`/play/?engine=v1` runs the old game with its untouched save. To make v1 the default again without a
code change, build with `PUBLIC_ENGINE=v1` (the v2 chunk is then never requested). The service worker
updates on the next visit like any release. v2's own data stays in its keys and is picked up again if
v2 returns.

## Known limits

- The import runs when the save has loaded (normally at once, at most about 2.5 s). If the player has
  already spent or earned in that window, the v2 pouch counts as touched and the v1 balances are not
  imported (the pouch is only marked as handled). Rare, and conservative on purpose.
- v1's progress (levels, stars) is not shown anywhere in v2. If the owner wants a "your v1 Spellbook"
  carry-over, that is a product decision and a new task.
- The old site pages (Spellbook gallery of v1 mosaics, share cards) still describe v1's 60 mosaics.
