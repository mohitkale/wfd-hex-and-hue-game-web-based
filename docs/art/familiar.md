# The Familiar ("Mothlet")

_Design note for M10.1. Art source: `packages/game/src/collect/familiarArt.ts`. Contact sheets:
[`familiar-sheet.png`](familiar-sheet.png) (10× zoom) and
[`familiar-sheet-mobile.png`](familiar-sheet-mobile.png) (actual 2× mobile size). Regenerate with
`npm run familiar:sheet`._

## What it is

A small round moth-sprite: a bean-shaped body in the colour of the cube it fetches, big two-pixel
eyes, glowing gold antenna tips, pale lavender wings and tiny feet. One design, one colour variant per
cube colour. It is a _familiar_ (a witchy companion), not an ant and not an abstract numbered circle:
the character is the actor on the board, the number lives on the group badge.

**Why this design:** a moth reads instantly as "magical night creature"; the wings give a silhouette
that differs from the cubes (square) at 24–32 px; and the body colour carries the matching rule (a red
familiar fetches red cubes) without a label. Wings and eyes are fixed across colours so every variant
is recognisably the same creature, and so colour is never the only cue (the colourblind symbol badge
of M6.5 can sit on the body later).

## Frames (16 × 14 px, 8 frames)

| Frame              | Used for                                               |
| ------------------ | ------------------------------------------------------ |
| `idle0`, `idle1`   | Hovering at the portal / waiting; wings up, wings down |
| `walk0`, `walk1`   | Walking to a cube (alternating feet, wings mid)        |
| `carry0`, `carry1` | Carrying a cube home (arms up, wings flap)             |
| `pickup`           | Crouched and reaching for the cube                     |
| `deliver`          | Stretched, tossing the cube into the portal            |

The renderer adds the bob, squash, tilt, trail and the carried cube itself; the sprite supplies the
poses. Frames are composed from layers (body, wings, arms, feet) so edits stay consistent.

## Palette rules

- Body ramp per variant: `mid` is the cube colour, `light` = 45 % toward white, `dark` = 40 % toward
  night, `cheek` = 50 % toward pink. The **outline is a deep tint of the colour** (62 % toward night),
  not black: it stays lighter than the board panel, so the silhouette shows (a black outline vanished
  in the first draft).
- Fixed colours: eye white, pupil, wing, wing edge, antenna glow. These never change between
  variants.
- CI (`tools/familiar/familiar.test.ts`) checks: all frames the same size and only legend
  characters; silhouette independent of colour; ≥ 30 body pixels, two pupils, two glow tips per
  frame; every frame distinct; variants pairwise distance ≥ 90; body contrast ≥ 3 and outline
  contrast ≥ 1.5 against the board panel.

## Size on a phone

Native 16 × 14, drawn at a whole-number scale: 2× is 32 × 28 device px (about 11 px per cube-sized
body on a 320 px phone at dpr 2). The renderer chooses the scale from the cube size so the creature
is about 1.3–1.6 cubes wide. This is judged on the real device build in M10.3; the sheet shows
the colour variants stay distinct at 2×.

## Source and licence

Original pixel art, authored as text in this repository for Hex & Hue (M10.1). No third-party
assets, no image models or generated bitmaps, no reference sprites, and nothing from Food Hunt.
**The repository has no licence file yet; the licence for this art follows whatever the owner
chooses for the project (decision pending).**

## Known limits of this first version

- The raised arms read as thin pillars until a cube sits between them (judged in-game, M10.2).
- No hurt/idle-sleep poses; not needed for the slice.
- One body shape. If the human review (gate G1) wants a different creature, only this file and its
  tests change; the rest of the pipeline uses frame names.
