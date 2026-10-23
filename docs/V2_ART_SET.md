# The representative art set (M11.3, gate G2)

_Six pieces, one per theme of the art bible, to judge the **art direction** before any library or
catalogue exists. Nothing here is recorded as approved: the M11.3 roadmap box stays unticked, every
piece has `reviewed: false`, and nothing is in `SHIPPED` until you say so._

## Look at it

| What                                                                                                        | Where                                                     |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| All six at 14 px per cube                                                                                   | [contact-sheet-full.png](art/v2/contact-sheet-full.png)   |
| All six at 9 px per cube (about what a 320 px-wide phone shows, see [V2_ART_DENSITY.md](V2_ART_DENSITY.md)) | [contact-sheet-phone.png](art/v2/contact-sheet-phone.png) |
| An interactive sheet with each rule's measurement and the provenance                                        | `npm run art:sheet`, then open `dist/art-sheet.html`      |
| The rule report in the terminal                                                                             | `npm run art:check -- --all`                              |

Open the phone-size sheet on an actual phone if you can: a picture that reads at 9 px on a laptop
can still disappoint on a screen.

## The six

| Piece             | Theme     | Grid  | Cubes | Families | Shades | Glint | Silhouette (A-20) | Lore                                                                                  |
| ----------------- | --------- | ----- | ----- | -------- | ------ | ----- | ----------------- | ------------------------------------------------------------------------------------- |
| Crescent Moon     | moon      | 30×30 | 312   | 3        | 12     | 3.2 % | 0.78              | The waxing crescent: a golden sliver that grows by night.                             |
| Triple Moon       | moon      | 40×20 | 328   | 3        | 9      | 0.0 % | 0.78              | Waxing, full and waning: the three faces of the moon, side by side.                   |
| Witch's Cauldron  | ritual    | 30×30 | 486   | 5        | 17     | 2.1 % | 0.87              | An iron cauldron over a low fire, its green brew just beginning to bubble.            |
| Amethyst Cluster  | crystal   | 32×30 | 564   | 3        | 10     | 2.7 % | 0.91              | A cluster of amethyst points growing from dark stone, purple as the sky after sunset. |
| Libra, the Scales | astrology | 32×30 | 443   | 4        | 12     | 2.3 % | 0.75              | The Scales of Libra, the sign of balance, weighing the light against the dark.        |
| Black Cat         | familiar  | 30×32 | 575   | 5        | 17     | 0.0 % | 0.92              | A black cat with lantern-green eyes, the classic companion of the night.              |

All six pass every rule in `npm run art:check` (A-01..A-35 and the provenance rules) with no warnings.
That means they are within the size, palette, shading, noise and silhouette limits of the art bible.
It does **not** mean they are good. The checks cannot tell you that, which is why you are looking.

## How they were made (and what that means)

Original work, drawn in this repository as text; no reference sprites, no image models, nothing
from Food Hunt. Each silhouette and its base shading was **blocked in with geometric drafting aids**
(discs, ellipses, polygons, a light-from-the-upper-left shader), then details were placed cell by
cell: the craters, the Libra gem, the cat's striped tail, the crystal facet seams. The recorded
workflow is in each piece's `provenance.notes`. If you think that is too mechanical to count as
"hand-crafted" (art bible §6, CLAUDE.md), say so: the honest alternative is to re-draw them by hand
from the sheet, and the checks would stay the same.

## What I think is weak

Most likely to be rejected, in my view: the **Black Cat** and the **Crescent Moon**.

- **Black Cat:** the ears, green eyes and nose read, but at phone size the body and head are a
  low-contrast dark blob. The "moon" behind it does not read as a moon: it shows as a gold arc on the
  left, a bar across the top and a strip on the right, so it looks more like a frame than a moon and
  it fragments the head outline. The whiskers are two faint lavender cells and the striped tail is
  not visible in either sheet. This piece needs a redraw, not a polish.
- **Crescent Moon:** recognisable, but the gold crescent has a fat belly (it can read as a boat) and
  the purple outer arc is a detached ring, so the two together look like a double crescent.
- **Amethyst Cluster:** three clear points, but the rock base is a flat slab and the crystals have
  few facet details. The weakest of the rest.
- **Libra, the Scales:** clearly scales, but the pans hang on plain vertical bars, so they read a
  little like hollow boxes; no chain detail.
- **Witch's Cauldron:** the flames are chunky, the legs stubby and the bubbles small blocks.
- **Triple Moon:** the strongest, reads at once; the craters on the full moon are faint.
- **Palette:** Night (dark violet) is the family for every dark thing and sits close to the board
  colour. It passes the contrast floor (the lowest shade is 1.69:1 against the board) but feels
  muted next to Gold and Amethyst.
- **Size:** at 30 per side and 300-575 cubes these are modest. The density work says 32 is the
  practical default; bigger "hero" pieces (36-40) are untested as art.

## Questions for you (G2)

1. Does the **direction** feel right: dark witchy pixel illustrations, jewel colours with ramps,
   a subject on the dark board, one warm light from the upper left?
2. Which pieces would you keep, which redraw, which drop? Is any theme missing here that matters
   to you (the full catalogue is authored only after this gate)?
3. Do they read on a phone at the cube size they would have in play? Is the shading visible, or too
   subtle (or too busy)?
4. Is **30 per side / 300-575 cubes** the right feel for a standard piece (M11.2's bots took 40-90 s for 430-770 cubes
   when tapping eagerly and 2.5-6 minutes when waiting for the board each time; real pacing is set
   by squad and spawn gap), or should pictures be bigger or smaller?
5. The black cat shows the problem of a dark subject on a dark board. My attempt (a gold moon behind
   it) did not work. Would you rather dark subjects get a clearer backdrop shape, or sit on the bare
   board with a lit rim?
6. Do you accept the drafting-aid workflow above, or must pieces be redrawn by hand? Until you
   answer, the `source: "hand-drawn"` label on these pieces is **not settled**: it is generous for a
   workflow that generated the silhouettes and base shading.
7. Please also run the 32×32 density board (`npm run dev`, then `/play/?engine=v2&level=dense`) on
   your phone and tell me whether it stays smooth: this is the on-device check deferred from M11.2.

Please say explicitly whether G2 is **approved** (continue to M11.5 and, with M12, the level
pipeline), **approved with changes**, or **not approved**. Until then M11.5, M12 and everything that
needs the representative art stay blocked. When you approve, the follow-up is a small docs PR that
ticks M11.3 and records your approval; a piece only gets `reviewed: true` (with your name, the date
and its content hash) once you have reviewed that piece.
