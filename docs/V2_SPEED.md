# The speed rule (M14.3; M15.6: 2× became 3×; M15.13: no automatic sprint, nothing carries over)

1× is always free and is the default. 3× unlocks for the **current level only**, through an **optional** rewarded ad (the ad placement id is still `speed2x`, so providers need no change). Speed changes only when the player chooses it, and 3× ends with the attempt it was bought for (a retry starts at 1×).
This replaces the shipped game's alternating free / ad policy for the v2 board (`rewards/speed.ts`,
which counts `speedTurns` in the v1 save, stays untouched until the v2 switch, M15.5: v1 is not edited).
The v2 rule is `collect/speedRule.ts` (pure, tested) and keeps its state in the session, not in the save,
so **v2 reads and writes no `speedTurns`** and adds nothing to the save.

## The rule

| Situation                                                                  | What the HUD shows                              | What a tap does                                           |
| -------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| No working provider (`PUBLIC_REWARDS=none`, and an unset production build) | **no speed button at all**: undo and retry only | n/a. No 3× offer is ever advertised                       |
| A provider that can show an ad                                             | `3×▶`                                           | Shows the ad; the game is paused while it is up           |
| Ad completed                                                               | `3×` / `1×`, a plain switch, for this level     | switches speed; a toast says "3× unlocked for this level" |
| Ad closed early                                                            | back to `3×▶`                                   | nothing changed, no reward; it may be tried again         |
| Ad could not be shown (no fill, error, timeout)                            | the button goes away for this level             | "No ad right now. Playing at 1×"; play carries on         |
| Another level                                                              | back to 1× and the offer                        | a retry of the **same** level keeps the unlock            |

- **Never blocks play.** Every path above leaves the game playable at 1×; an ad that hangs or throws
  becomes "unavailable" (`safeShow`, 90 s), and a provider that never settles cannot trap the game:
  the `…` button, Retry and Undo end the wait at any moment (it counts as "no ad right now"). A late
  result of an older wait never touches a newer one's state; a completed ad for the level still being
  played still counts.
- **The HUD keeps three fixed slots** (undo, retry, speed), so undo and retry never move when the speed
  button appears or disappears; the HUD is rebuilt only when its shape changes, else only the label.
- **No fake rewards.** Only a completed ad grants 3×. The mock provider (a "Mock ad for ..." panel with a
  3 s countdown and a Close button) is the development default only; a production build defaults to
  none, and `PUBLIC_REWARDS=mock` there logs a warning.
- **No paid provider, billing or credentials.** Real networks plug in behind `RewardsProvider`
  (`rewards/types.ts`); none is added here.
- **`?speed=3`** is a review override (it opens a level at 3× and counts as unlocked for it). It is not
  an ad reward, and it only works in development builds (`import.meta.env.DEV`), so it is not a free 3×
  in the deployed review build.

## 3× never changes the outcome

Speed only changes how many ticks are shown per second (`TickClock`); the rules never read time
(GAME_DESIGN_V2 §9). `speedRule.test.ts` plays the same solver line on every tutorial level, two art
pieces and the slice through the clock at 1× and 3× (frames of about 16.7 ms through `stepFrame`, the same per-frame step the scene runs, each action tapped as soon
as the board is settled): the action log, the final state hash and the win are identical, and 3× takes
under 70% of the frames. (A person tapping at the same _visual_ moment at two speeds taps at different
ticks, which is a different log; that is the player's choice, not the rule's.)

## Tests

The view for every situation above (including the cancel); restoring the level's speed (only for the level it was
unlocked for, never an ad in flight, the dev-only override); each ad result (completed, dismissed, unavailable) including "only
`rewarded` ever gives 3×"; the unlock is per level (another level resets it, a retry keeps it);
`PUBLIC_REWARDS=none` and an unset production build advertise nothing; the mock is labelled and only the
development default; and the outcome-equality test.

## Verified, and not

In the browser pane at 375×812 (development build, so the mock provider): the HUD shows `3×▶`; tapping it
shows the mock ad and pauses the game; after the countdown the button becomes a `3×` switch and a toast
says so; with a "none" provider swapped in, the HUD has only undo and retry.

**Not checked:** a real ad network (none exists yet); the closing-early and no-fill paths in the running
game (unit-tested, not clicked through); what happens to the page when a real ad takes over the screen
(focus, audio, visibility); the 3× unlock surviving a page reload (by design it does not).

## The free end-game sprint (M15.6, removed and then brought back narrower in M15.13)

M15.6 played the rest of a level at 3× for free once nothing was left to decide. With every tray
working (M15.13) that state came early and often, so the board switched to 3× unasked, and with 3×
chosen on top the owner found it too fast to follow. It was removed: the speed only changes when the
player chooses it. Every attempt (a retry, a restart, another level) starts at 1×.

Later the same day the owner asked for it back in a narrower form: **once no box is left to choose**
(every column empty), the board switches to 3× by itself for the rest of the level and the speed
button shows "3×". The player's own choice is untouched (it stays 1× for the next attempt).
