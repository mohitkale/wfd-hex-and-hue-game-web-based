# The v2 vertical slice: "Moonlit Hat" (gate G1)

_M10.5. This is the build a human plays to decide whether the new collection game **feels right**
before any art catalogue or level pipeline is built on it. Nothing here is recorded as approved: the
roadmap box for M10.5 stays unticked until you say so._

## Play it

```bash
npm install     # once
npm run dev     # then open the URL below (the port is printed, usually 4321)
```

| URL                              | What you get                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `/play/?engine=v2`               | The slice level, to play yourself                                                          |
| `/play/?engine=v2&demo=win`      | The recorded winning line, played for you (about 90 s at 1×; add `&speed=2` to halve it)   |
| `/play/?engine=v2&demo=slots`    | A losing line: two groups park, a third runs dry with both slots full ("Out of slots")     |
| `/play/?engine=v2&demo=deadlock` | The quickest loss: two taps leave nothing that can reach the cubes that are left ("Stuck") |
| add `&cb=1`                      | Colour-blind symbols                                                                       |

Use a phone-sized window (or your phone on the same network) for the intended portrait layout. The
1×/2× button is a review-build control; the real 2× rule (optional rewarded ad) arrives in M14.3.
Tapping undo or restart ends a demo. Reduced motion and the sound and haptics settings are honoured.

## The level

A 14×14 picture of 196 cubes in six colours: a purple witch's hat with a red band and a gold buckle
holding a green gem, under a gold crescent moon, ringed by cyan starlight, in a blue night sky.
Colours **layer**: the sky is reachable from the start, the halo and the moon partly, the hat only
once the halo is gone, the band only once the hat's edge is gone, and the buckle and gem last.
There are 13 groups in 3 columns, **2 holding slots**, a field of 2 working groups, 3 familiars per
group. The art is a working placeholder: the art bible and the real art set are M11.

| Screenshot                                                 | Shows                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [start-first-summon.jpg](art/m10.5/start-first-summon.jpg) | The opening board, the first group out, familiars walking the ring to the cubes    |
| [two-groups-parked.jpg](art/m10.5/two-groups-parked.jpg)   | Cyan 7 and gold 6 waiting in the two slots, the winning line's slot-filling moment |
| [hat-revealed.jpg](art/m10.5/hat-revealed.jpg)             | Mid-game: the sky is gone and the hat, band and buckle show                        |
| [win.jpg](art/m10.5/win.jpg)                               | The completion screen after the winning line: 196 of 196 cubes delivered           |
| [lose-slots-full.jpg](art/m10.5/lose-slots-full.jpg)       | The slots-full loss                                                                |

## The intended strategy

You pick **which group to send, and when**. A group can only carry cubes of its colour that it can
reach _right now_; if it runs out with capacity left it waits in a holding slot (you have two) and
you resume it once more of its colour is exposed. So the puzzle is to peel the picture from the
outside in, sending a colour only when enough of it is open, and to spend your two slots on the
groups that truly have to wait.

The winning line (also the `demo=win` recording, tapped one at a time after the board settles):
cyan 11 (middle column) parks with 7 left; gold 4 completes the moon; gold 8 parks with 6 left (both
slots full); blue 21 peels the sky; cyan 15, red 6, red 11, blue 48 and so on inward; purple, red 5,
the green gem and purple 24 finish the hat; then resume the two waiting groups, which now reach
everything they need.

Verified by exhaustive search over the real engine (`tools/collect/slice.test.ts`). At each of
these moves of the winning line, a plausible alternative could not be recovered from:

| Tap | The winning move | An alternative at that moment                                            |
| --- | ---------------- | ------------------------------------------------------------------------ |
| 1   | cyan 11          | gold 8 or cyan 15 → makes the level unwinnable (only one front is right) |
| 2   | gold 4           | gold 8 → makes the level unwinnable                                      |
| 4   | blue 21          | cyan 15 → loses at once                                                  |
| 7   | red 11           | cyan 11 → loses at once                                                  |
| 8   | blue 48          | cyan 11 → loses at once                                                  |

The level has other winning lines, not just this one; the point is that most orders do not win.

## What was checked, and what was not

Checked headlessly (all in `tools/collect/slice.test.ts`, run by `npm run verify`): the level is
valid; the recorded winning line wins and delivers all 196 cubes; the two recorded losses lose for
the stated reasons; the level is solvable by exhaustive search; taking away one slot makes the
winning line lose; at least three decisions on the winning line have a losing alternative, the very
first among them; and none of the cheap strategies wins (column-spam left to right, right to left
and round-robin, resume-first in both directions, always largest, always smallest, always most cubes).
Random tapping won under 25% of 200 seeded runs and more than none.

**Not checked, because only a person can:** whether it _feels_ good (the pace of pick-up and
deliver, the swarm, the sounds and vibration, the completion), whether the choices are readable
without reading this page, whether the two-minute length is right, and how it runs on a real phone
(see `docs/V2_PERF.md`: desktop numbers only). Known rough edges: on a short phone screen the
browser's own bottom bar can cover the second row of queued groups (the play-screen redesign is
M14.1), and the picture is placeholder art.

## Questions for you (G1)

1. Does collecting feel physical: do you see the familiars fetch, carry and deliver, and is the 1×
   pace right? Is 2× needed on this level?
2. Do the group numbers and the two slots make sense without explanation? Did you understand why a
   group was waiting?
3. Did the first choice feel like a real decision? Did you find the losing lines naturally?
4. Do the sounds and effects help or annoy? Any you would remove?
5. Is a run of about 90 seconds right for one level?
6. Anything that would make you stop playing?

Please also say explicitly whether the gate is approved (continue to M11, art) or what must change
first. Until then M11 onwards stay blocked.
