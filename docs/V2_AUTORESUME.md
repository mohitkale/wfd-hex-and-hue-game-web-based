# Auto-resume: a pending box wakes by itself (M15.10)

Owner feedback (docs/V2_PLAYTEST.md item 15): "when in PENDING state, it should auto resume as soon as
the coloured cubes are available to be taken... it should not ask the player to click it manually...
the tray remains open and it resumes as soon as the chance is available."

## The rule

A box that has nothing it can reach waits in its tray. The tray stays **open** (the box is dimmed with
"zz"). The moment it has a cube it can reach **and a working place is free**, it goes back to work by
itself, in slot order, between ticks. There is no tap on a pending box any more.

It is the game's own `resume` action, applied for the player at once (`packages/core/src/collect/autoResume.ts`),
so nothing in the engine's rules changed; what changed is that the player no longer chooses _when_.
It is a **session policy**: `new CollectSession(level, undefined, undefined, true)`, which the board
uses. Without the flag a session plays the free-choice rules exactly as before (the core tests, the
generator, the simulated players and the measures still do).

- The log records each automatic resume (`auto: true`); `session.moves` counts only the player's taps,
  so the daily's "moves" and the events are the player's own. Replay of a log reproduces the game.
- The working limit still applies: with every working place busy, nothing resumes until one frees.
- Hint searches the same policy (`hintFor(..., auto)`), so it never suggests a resume.
- The tutorial's "waiting" lesson now says _"It waits. Blue wakes it"_ and the third step ("tap the
  waiting group") is gone.

## What it costs, honestly

Free choice could resume a box _late_, or summon something else first with the free place. Auto-resume
removes that choice, so a level that was winnable only by resuming late could become unwinnable.
Because of that:

- `solve(level, budget, true)` and `replayLine(level, line, true)` search and replay the policy; the
  **production gate (`npm run production:check`) now solves every shipped level under it** and replays
  the line in a live auto session. All 11 levels pass.
- A test proves the direction: whatever auto-resume can win, free choice can win (so the policy only
  removes options), and a line found under it wins when replayed with it and contains no manual resume.

Not re-done under the policy (still on the free-choice model): the simulated-player strategy report,
the difficulty measures and score, the generator's quality gates and the curve. They describe the
levels as the rules allow, not as auto-resume plays them; the levels are the same, but an honest
re-measure under the policy (and a decision on the difficulty bands, since one decision type is gone)
is a follow-up. The human playtest (G3) is the real judge of whether the game still has decisions.

## Also in this change

- The board shows **14 ticks a second at 1×** (was 24): the owner found the familiars "pretty fast".
  One tick is one cell, so a 14-cell route takes about a second. The 3× speed-up and the free
  end-game sprint multiply it. (`SHOWN_TICKS_PER_SECOND`; the rules and the "seconds" estimates of the
  measures, which use 24, are untouched.)
- A boot error found while doing this: a mistake in the previous change made the board fail to build
  (`this.panels` used before it existed). It is fixed; there is no automated test that builds the
  Phaser scene, which is how it reached a green CI.

## Queueing a box in a free tray (M15.11)

Owner feedback (docs/V2_PLAYTEST.md item 18): a tap failed with "Too many groups are working" or "No
reachable cube of this colour yet" while trays were empty. The trays are `fieldCap + slots`, so the ones
meant for waiting boxes looked free whenever the working limit was reached.

Now a tap on a column's front box that cannot work yet is **queued**: it goes straight into the lowest
free tray, waits there (dimmed, tray open) and the game resumes it by itself when it can work (the
working limit allows it and it can reach a cube). It fails only when no tray is free, and then with the
reason it cannot work. `explainTap` (`packages/core/src/collect/actions.ts`) is the tap rule;
`explain` and `legalActions` stay "can work now", so the solver, hints and measures are unchanged.
Because queueing only adds options (never removes one), every level that was solvable still is. It does
change how hard levels are: queueing a front box lets the player peel a column early, so this is part of
the M15.12 re-measure and of what the human playtest has to judge.

### Consequences of queueing (from the M15.11 review)

- **Loss rules.** In the player's game a board is not a deadlock while queueing a box into a free tray
  could expose one that can work (`queueCanProgress`, used by `step(state, true)`; the solver, hints,
  measures and simulated players keep the strict rule, so they can still call such a board dead).
  After a queue tap the status is re-checked at once (`reassess`), because a settled board does not
  tick.
- **A queued box takes a tray a working box may need.** If a working box runs dry while every tray is
  taken by queued boxes, the game ends as `slotsFull`. Undo and the Extra Slot booster recover it, and
  nothing is blocked, but an innocent-looking tap can cost the last tray. This is the price of never
  refusing a tap while a tray looks free; a reserve (keep one tray free while anything works) or
  sending a never-started queued box back to its column are the alternatives if playtests show it hurts.
- **The gate does not cover the real rules until M15.12.** The strategy players and the tier gate use
  the strict rules, so "levels resist column-spam" is **unproven** for the game as played now: a
  queue-aware column-spam player beats `slice-moonlit-hat` and `art-black-cat` right to left. M15.12
  must add queue-aware players to the gate before any G3 evidence is collected.
- **Hints** search the strict rules, so a hint can say Undo is the way out on a board that only a queue
  tap saves.
