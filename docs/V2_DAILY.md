# Daily challenges (M13.5)

One puzzle a day, the same for everyone, with completion tracking and a spoiler-free share text.
Local only: no account, no leaderboard, nothing leaves the device unless the player shares the text.
Review build only (`?engine=v2`); the shipped game is untouched.

## Try it

- `/play/?engine=v2&level=daily`: today's challenge (UTC date).
- `...&level=daily&date=2026-10-26`: another day, as **practice**: it plays that day's level but
  records nothing and shows no streak or share (a bad date falls back to today). Only today's
  challenge counts, so a streak or total can only come from days played on their day.
- Spellbook → **Daily** button: plays today's challenge; the header says whether it is done, the
  streak and the total.

## The schedule (`daily.ts`)

- **Same date, same level, on every device.** The only inputs are the UTC date, the pool of level ids
  (sorted, so listing order never matters) and `DAILY_VERSION`. The arithmetic is integer only
  (`Math.imul` hashing and the engine's seeded generator); there is no clock, locale or time zone in
  it. The clock is read once, in the scene, and turned into a UTC `YYYY-MM-DD`.
- **Fair.** The pool is walked in cycles of one day per level in a seeded order, so every level comes
  up once per cycle and never on two days running (also across a cycle boundary; a pool of two
  alternates; a pool of one repeats, which is all it can do). Tested for pool sizes 1 to 12 over
  thousands of days.
- **Same game version.** The pool today is the six art pieces. A test pins the pool: change it and the
  test fails until `DAILY_VERSION` is bumped, which re-seeds the schedule, so "the same challenge for
  the same date and game version" holds. Golden dates are pinned in the tests too.
- Every daily level is a committed, solver-verified art level (M12); nothing is generated on the
  player's device.

## Completion (`dailyBook.ts`)

Stored in `hexhue.v2.daily`, apart from the Spellbook and the shipped save. A day is recorded the
first time it is won (moves of that attempt, time); winning it again changes nothing, so the first
result and the streak stand. The **streak** is consecutive completed days ending today, or ending
yesterday while today is not done yet. A completion that could not be stored claims no streak, and an
unreadable book is never overwritten. Storage trouble never blocks play.

## The win card and sharing

On a daily the win card adds a line ("Daily complete · 3-day streak", "Today's daily was already
complete", or "could not be saved") and a **Share** button beside Spellbook. Share uses the system
share sheet when there is one, else copies to the clipboard, and says which ("Shared", "Copied to
clipboard", "Could not share"); it never throws. A dismissed share sheet (or one already open) is
left alone: no note, and the clipboard is not overwritten behind the player's back. A second tap
while a share is pending is ignored. A practice run has no Share button.

The text is only the day, the result and the streak:

```
Hex & Hue Daily · 2026-10-24
✦ Solved in 7 moves
🔥 3-day streak
```

It never names the picture or a colour and reveals no individual move (only how many), so it spoils nothing (tested against every
piece's id, name and lore). No link is added: v2 is not public yet.

## Verified, and not

Unit tests: the schedule (dates, determinism, pinned pool and golden days, fairness, negative days),
`?level=daily` resolution, the book (first completion, streaks across month, year and leap ends,
corrupt and unreadable storage), the share text and the share/copy fallback. In the browser pane at
320×480: today's daily played to a win (recorded for its UTC date), another day by `?date=`, the win
card with the daily line and both buttons fitting, Share degrading to "Could not share" (the pane has
no clipboard), and the Spellbook header and Daily button.

**Not checked:** the real share sheet and clipboard on a phone, a day rolling over while the game is
open (the date is read each time the board is built, so "Back to the board" after midnight UTC starts
the new day's puzzle), and anything over several real days. The move count is the length of the
attempt's log, so an undo lowers it; there is no leaderboard to cheat.

**Open:** with six pictures a cycle is six days, so the daily repeats every week or so until the
worlds are filled (docs/V2_WORLDS.md); that is a content limit, not a schedule one. Seals
(docs/V2_VARIETY.md) are not used, as they are not tuned. The time zone is UTC for everyone, so the
daily changes at a different local hour in different places.
