# Onboarding: teach by interaction (M14.2)

A first visit to the v2 build starts in a short tutorial: four tiny levels, each teaching one thing by
doing it. No screen of rules, no long text: every hint is at most six words, points at the thing to
tap, and is finished by something the player did.

## What it teaches, in order

| Level (`?level=`)  | The lesson                                                                                 | Hints                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `tutorial-summon`  | Summon, watch them carry cubes home, watch the number count down                           | "Tap a group to summon it", "Watch the number count down", "Tap the next group"                                          |
| `tutorial-blocked` | A buried colour cannot be reached: the refused tap says why, then clear what is in the way | "Red is buried. Tap it", "Clear the blue around it", "Now red is free: tap it"                                           |
| `tutorial-slots`   | A group with nothing left to reach waits in a slot; send it again when it can              | "Tap the red group", "It waits. Clear the blue first", "Tap the waiting group"                                           |
| `tutorial-undo`    | A bad choice can lose (one slot): Undo takes it back                                       | "Tap the red group", "Now tap the green group", "Out of slots. Tap Undo", "Clear the blue first", "Wake red, then green" |

Each level is at most 5×5 cubes and is verified by the solver. The undo level really does lose when its
hints are followed to the mistake, and Undo really does recover (both tested).

## How it behaves

- **A hint is a picture, never a gate.** A short caption under the HUD and a softly pulsing ring
  around what to tap (a column, a slot, or the Undo button). It takes no taps, so the player can tap
  anything, in any order; the hint simply follows what they did. The ring does not pulse with reduced
  motion.
- **Steps are finished by the player**, never by a timer or a "Next": the state machine (`tutorial.ts`,
  pure) reads the game state and a few flags the board reports (a refused tap, an undo). It never goes
  back: what was taught stays taught. A restart starts the lesson again.
- **A hint is shown only when it is true.** A step can say when it is `ready`: "it waits" appears only
  once a group really waits (and points at the blue to clear), "Now red is free" only once red can be
  reached, "Out of slots. Tap Undo" only after a loss. If the player takes another road (blue first,
  say), the steps they have already got past are skipped. Tested by playing other orders and checking
  every hint against the state on every tick.
- **Skip is always there** ("Skip ›", a tap target of 44 by 36 css px on its own row, clear of the HUD
  buttons, hidden once the tutorial is over). Skipping ends the hints **for the whole visit** (a retry
  or Next does not bring them back) and the tutorial is not offered on later visits. An explicit
  `?level=tutorial` (or a `tutorial-` level) still opens it, with hints.
- **Finishing a level** is remembered (`hexhue.v2.tutorial`, its own key); the win card offers **Next**
  (or **Play** after the last, which opens the slice), with Retry always free. Storage trouble only
  means the tutorial is offered again.
- **Where a visit starts.** With no `?level=`, a first visit starts in the tutorial unless it was
  skipped or finished; `?level=tutorial` always opens the first level not finished; `?level=`
  anything else, the daily and `?demo=` never get a tutorial. The review build's default used to be the
  slice (docs/V2_SLICE.md): it still is after the tutorial or a skip, and `?level=slice` always is.

## Explaining why

- A refused tap says why ("No reachable cube of this colour yet", "Wax-sealed: finish the key colour
  first", "Too many groups are working"), as before.
- **New:** the first time a group runs dry and goes to wait, a short note says so ("Nothing left to
  reach: it waits"); in the tutorial its own hints say it instead.
- A loss says why on its card ("Out of slots": a group ran out of cubes with every slot full), and in
  the undo lesson the card makes Undo the main button.

## Tests (`tutorial.test.ts`)

The state machine (one hint at a time, advance only on the player's action, never backwards, skip, the
six-word limit on every hint of every level); every tutorial level valid, tiny and solver-verified; a
bot that does exactly what each hint says wins each level and sees exactly the hints listed above; the
loss and the Undo in the last lesson; the refused tap costs nothing; random play that ignores every
hint never breaks the machine and every hint's target is a real column or slot; the book (order, skip,
unknown ids, storage failures); where a visit starts; the "why" note.

## Verified, and not

In the browser pane at 375×812 with a cleared store: the first visit opened `Summon` with its caption
and ring; tapping the pointed-at group moved the hint on; the win card offered Next and remembered the
level; Next opened `Buried`, where tapping the red group showed the refusal and moved the hint to the
blue; Skip hid the hints, was remembered, and the next visit opened the slice; the undo level's loss
card made Undo the main button.

**Not verified:** the issue's criterion that **first-time players complete the tutorial** can only be
answered by the human test (M15.4, gate G3), so it is still open; the hint wording has not been tried
on a real first-time player; the Undo lesson's ring on the HUD button was seen only behind the card's
shade; screen-reader support for the hints (they are canvas text only).
