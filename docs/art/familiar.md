# The familiars: a flying bat and a trotting cat (v2.0.0 look; M15.7)

_Source: `packages/game/src/collect/familiarDraw.ts` (the drawing), `familiarArt.ts` (frame names, colour
maths, species), `familiarAtlas.ts` and `familiarTextures.ts` (the packed atlas). Tests:
`tools/familiar/familiar.test.ts`. This replaces the 16 x 14 pixel-art "Mothlet" of M10.1, which the
owner found too 8-bit._

## What they are

Two smooth vector characters, both facing the player and left-right symmetric, tinted by the colour of
the cubes they fetch (a red familiar fetches red):

- **Bat**: round body, short pointed ears, big white eyes with a highlight, pink cheeks, a small smile
  with two fangs, scalloped wings that flap, tiny feet. Flown by the familiars of every picture except
  the `familiar` ones.
- **Cat**: round head with pointed ears and whiskers, a body with a lighter belly, a curled tail that
  swishes, paws. Trots for the `familiar` pictures (`speciesFor`: today the black cat).

The outline is a deep tint of the cube colour, lightened only as far as needed to stay at least 1.6:1
against the board panel (the same floor as the art pipeline), so every colour reads on the dark board.
Eyes, cheeks, the finger bones and the sparkles are fixed colours.

## Frames (8 per colour, drawn on a 16 x 14 unit grid at 4x = 64 x 56 px)

| Frame              | Used for                                                                  |
| ------------------ | ------------------------------------------------------------------------- |
| `idle0`, `idle1`   | Hovering at the portal / waiting; wings up and down (cat: tail swish)     |
| `walk0`, `walk1`   | Moving to a cube: feet apart then together, a small bob                   |
| `carry0`, `carry1` | Carrying: stubby arms raised in a V under the cube (drawn above the head) |
| `pickup`           | Crouched, wings tucked, arms reaching down for the cube                   |
| `deliver`          | Wings wide, arms thrown up with sparkles                                  |

The renderer adds bob, squash, trail and the carried cube; the sprite supplies the poses.

## How it is drawn

`drawFrame(painter, frame, colour, species)` issues 2D-canvas calls (paths, ellipses, fills and strokes)
through a small `Painter` interface, so the tests can record the calls without a browser. At level
start the atlas texture is painted once (one row per colour, 512 px wide, at most 16 colours = 896 px
tall) with linear filtering, so the sprite stays smooth at any phone density and scale
(`spriteScaleForCell` is now continuous).

## Tested

Every frame of both species draws, stays inside its cell, is deterministic, and has the same
silhouette for every colour; the poses differ from each other; delivering sparkles and carrying has
arms; the colour-blind badge sits on the belly; the atlas layout is complete and fits one texture.

## Limits

- Judged by eye in the browser pane only (the contact-sheet PNGs of the pixel version were removed;
  there is no node canvas to regenerate them). The owner's verdict is the test that matters.
- The bat's wings are two wing shapes mirrored; the flap is two or three poses, not a full cycle.
- Species is chosen per picture, not per world; a world-wide choice is a content decision.
