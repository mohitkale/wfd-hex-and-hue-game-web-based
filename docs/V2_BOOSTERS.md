# v2 boosters and economy (M14.4)

Rules for the three boosters on the v2 board, the coins that pay for them and how a player earns
both. Code: `packages/core/src/collect/{boosters,hint}.ts` (what a booster does),
`packages/game/src/collect/{pouch,boosterUse,BoosterTray}.ts` (what it costs and how it is used).

## Principles (from CLAUDE.md)

- **Retry is always free and instant.** It never costs a coin and never waits.
- No lives, energy, timers, forced ads or waiting. Boosters never need an ad.
- Every booster is earnable by playing: coins come from winning, and a starting kit lets a new
  player try each one.
- A booster that cannot do anything, or a hint that could not decide, **costs nothing**.
- Not enough coins is never a wall: the message says so and says Retry is free.
- The tutorial is a lesson, not a shop: no tray, and its Undo is free.

## What happened to the v1 five

| v1 booster | v2                         | Why                                                                                                                                                                                                              |
| ---------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Undo       | **Kept, adapted**          | Restores the state before the last select/resume (GAME_DESIGN_V2 §6), one step per use. It used to be free and unlimited (50 deep), which turned a deadlock puzzle into trial and error; now each use costs one. |
| Extra Slot | **Kept, adapted**          | One more holding slot for the rest of the level (max 2 per level). It survives Undo and Retry.                                                                                                                   |
| Revive     | **Merged into Extra Slot** | Using Extra Slot after a `slotsFull` loss revives the game (v1 did the same). A deadlock is not revived: a slot cannot undo it, Undo can.                                                                        |
| Shuffle    | **Replaced by Hint**       | v1 reshuffled the mosaic. Re-dealing columns or cubes would break the solver-verified level, so there is nothing safe to shuffle.                                                                                |
| Magic Wand | **Retired**                | It collected cubes by itself, bypassing the pick-up, carry and deliver loop that is the v2 game.                                                                                                                 |
| (new) Hint | **Added**                  | Names a move after which the level is still winnable, found by the real solver; says so if nothing wins.                                                                                                         |

## Undo removed (M15.13, owner decision)

There is no Undo on the v2 board: no HUD button, no "Undo last move" on the loss card and no Undo
lesson in the tutorial. Retry is the free, instant way to start over. The engine keeps
`CollectSession.undo()` (tests and tools use it), and old pouches keep their `undo` count, unused.

## Power-ups (M15.13)

Three more, asked for by the owner after the reference game's power-up row. All keep the v2 loop:
familiars still come out of a tray, fetch one cube each and carry it into the hole. Code:
`packages/core/src/collect/powers.ts` (what they do), `boosterUse.ts` (`useCall`, `useSweep`,
`useLantern`), the round buttons in `BoosterTray.ts`, the view in `LanternPanel.ts`.

| Power-up        | Button | Price | What it does                                                                                                                                                                            |
| --------------- | ------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Familiar's Call | 🐾     | 25 ✦  | Tap it, then a box behind a column's front: that box moves to the front. One Undo takes it back.                                                                                        |
| Besom Sweep     | 🧹     | 40 ✦  | Tap it, then a box in a tray (with one sweepable box it applies at once): its next 6 familiars fly over the picture to cubes of its colour that other colours bury. Undo takes it back. |
| Crystal Lantern | 🏮     | 15 ✦  | Shows every box still to come in every column, front first; play waits while it is open. Paid once per level, then free to reopen.                                                      |

- Stock first, then coins; a power-up that would do nothing costs nothing.
- **Earnable by playing:** the starting kit has one of each (an older pouch without them gets that
  one too), and every third first clear gives one, chosen by the level's id (`giftFor`), shown on the
  win card.
- Besom Sweep can only help: it removes cubes of the box's own colour, never adds a constraint, and
  the engine's invariants hold after it (`powers.test.ts`). A flown-out buried cube leaves an enclosed
  pocket that joins the walkway when a neighbour opens.

## Effects

- **Undo.** `session.undo()`: the state returns to before the last `select`/`resume` and that action
  leaves the log; works out of a loss. Nothing to undo → nothing happens, nothing charged.
- **Extra Slot** (the extra tray: it adds one tray to the row, M15.9). `addSlot`: `params.slots += 1`, an empty slot, event `slotAdded`. After a
  `slotsFull` loss the stalled group parks in the new slot and the interrupted tick is finished
  (`reviveFromSlotsFull`: the same code the tick uses, the tick counter does not advance), so the
  result is exactly the state a level built with the extra slot would have reached. The session
  patches every undo snapshot, so Undo cannot take the slot away; Retry reapplies it. Refused once
  the game is won and beyond 2 per level.
- **Hint.** `hintFor`: solves from the current state with the real engine and a 4,000-node budget and
  returns `move` (a legal first move of a winning line), `doomed` (no play wins: use Undo or Retry),
  `unknown` (budget ran out: never a guess), `wait` (the first move is not legal until the board
  settles) or `over`. Only `move` and `doomed` are charged. The suggested column or slot flashes.
  Hints assume settled play (GAME_DESIGN_V2 §10).

## Economy

Stored apart from the shipped game's save, in `localStorage` key `hexhue.v2.pouch`
(`{ version, coins, boosters: { undo, extraSlot, hint }, paid: levelIds }`). Local only.

|                                              |                                                         |
| -------------------------------------------- | ------------------------------------------------------- |
| Starting kit                                 | 50 coins, 2 Undo, 1 Extra Slot, 2 Hint                  |
| Prices                                       | Undo 15, Hint 10, Extra Slot 40                         |
| Paying                                       | stock first, then coins; short → refused with no change |
| First clear of a level                       | 15 + 1 per 40 cubes (max +25)                           |
| Replay of a cleared level                    | 3                                                       |
| Daily challenge, first completion of its day | +15                                                     |

Any booster is within three first clears of even the smallest level (tested); replays are slow on
purpose (14 replays buy an Extra Slot), so farming is possible but pointless.

**Persistence.** With no usable storage nothing is saved, so a player in that state starts every
visit with the starting kit (harmless for play). A pouch that could not be read is never overwritten (as for the Spellbook and the
daily book); a corrupt field falls back on its own and a negative count clamps to 0, never a top-up.

**Migration of v1 booster counts.** None. The v1 save (`hexhue.save`) keeps `coins` and
`boosters.{undo,shuffle,extraSlot,wand}` untouched for the shipped game, and the v2 board never reads
it. At the M15.5 switch a new player gets the starting kit above; carrying v1 balances over is a
product decision for M15.5 (the v1 `coins` and `extraSlot`/`undo` counts map one-to-one, `shuffle`
and `wand` have no v2 equivalent).

## Not done here

- The 2× rewarded ad is the only ad (M14.3); no booster is offered for an ad.
- Coin and booster balances are not yet part of the M14.5 events.
