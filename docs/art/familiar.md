# The Familiar ("Mothlet")

_Design note for M10.1. Art source: `packages/game/src/collect/familiarArt.ts`. Contact sheets (regenerate
with `npm run familiar:sheet`; CI fails if they go stale):
[`familiar-sheet.png`](familiar-sheet.png) 10× zoom, [`familiar-sheet-mobile.png`](familiar-sheet-mobile.png)
2×, [`familiar-sheet-phone.png`](familiar-sheet-phone.png) at the scale the renderer picks for dpr 1, 2 and 3._

## What it is

A small round moth-sprite: a bean-shaped body in the colour of the cube it fetches, big two-pixel
eyes, glowing gold antenna tips, pale lavender wings and tiny feet. One design, one colour variant per
cube colour. It is a _familiar_ (a witchy companion), not an ant and not an abstract numbered circle:
the character is the actor on the board; the number lives on the group badge.

**Why this design:** a moth reads instantly as "magical night creature"; the wings give a silhouette
that differs from the cubes (square) at phone sizes; and the body colour carries the matching rule (a
red familiar fetches red cubes) without a label.

## Frames (16 × 14 px, 8 frames, composed from layers: body, wings, arms, feet)

| Frame              | Used for                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| `idle0`, `idle1`   | Hovering at the portal / waiting; wings up, wings down                         |
| `walk0`, `walk1`   | Walking to a cube: feet apart then together, wings beating between two heights |
| `carry0`, `carry1` | Carrying: arms raised in a V under the cube (drawn above the head); wings low  |
| `pickup`           | Crouched, wings tucked, arms reaching down for the cube                        |
| `deliver`          | Wings wide, arms thrown up with sparkles; feet stay on the baseline            |

The renderer adds bob, squash, tilt, trail and the carried cube; the sprite supplies the poses.
All frames stand on one baseline (row 12), keep the last row empty and are a single connected
creature (checked).

## Palette

- Body ramp per variant: `mid` is the cube colour, `light` 45 % toward white, `dark` 40 % toward
  night. The **outline is a deep tint of the colour**, lightened toward the colour only as far as
  needed to stay at least 1.6:1 against the board panel (the same floor as the art pipeline). My
  first draft used a near-black outline that vanished on the dark board.
- Fixed colours (identical across variants): eye white, pupil, wing, wing edge, antenna glow, cheek.
- Pale colours (yellow) give white eyes little contrast with the body; the dark pupils inside the
  white carry the face, so the pupil/white contrast (≥ 7) is what is checked.

## Colour-blind players (M6.5)

Colour alone cannot carry the matching rule. Simulating deuteranopia (Machado et al., severity 1) on
the eight sheet colours, the closest pair falls to about 66 on the redmean scale, below the 90 the art
requires in normal vision (red/green/orange/yellow drift together; the check is in
`tools/familiar/familiar.test.ts`). So the sprite reserves a **badge anchor** on the chest
(`badgeRect(frame)`: 6 × 4 native px, 6 × 3 on the crouched pickup frame), clear of the eyes and
wings and checked to lie on body pixels in every frame. With colour-blind mode on, the renderer draws
the colour's M6.5 symbol there (and on the carried cube). Drawing the badge is M10.2 work; the
anchor and the test that it fits are delivered here.

## Size on a phone

Native 16 × 14, drawn at a whole-number device-pixel scale from `familiarScale(dpr)`: **2× at dpr 1
(32 px wide), 3× at dpr 2 (24 px), 5× at dpr 3 (about 27 px)**, in the 20–28 CSS px band except at dpr 1,
where it rounds up to 32 rather than using an unevenly scaled 1.5×. Integer scales keep
nearest-neighbour pixels even. The coloured body is the 8 × 9 centre of the sprite (about 12 px wide
at 24 CSS px); the wings are the largest, lightest part of the silhouette, so identity at small
sizes rests on that body area, which is why the colour-blind badge matters.

## Texture budget

One packed atlas per level (`familiarAtlas.ts`): colours down, frames across, **128 × 14·n px for
n ≤ 16 colours (at most 128 × 224)**, one texture, one draw batch, frames registered as
`"<colourIndex>:<frame>"` with a full manifest (`atlasManifest`). Tests assert the size limits, that
rectangles do not overlap, and that the packed pixels equal the per-frame pixels. Changing level
replaces the atlas (`ensureFamiliarAtlas` removes other `familiars:` textures). Sprites of different
colours share the texture, so a mixed swarm does not break batching.

## Source and licence

Original pixel art, authored as text in this repository for Hex & Hue (M10.1). No third-party assets,
no image models or generated bitmaps, no reference sprites, and nothing from Food Hunt.
**The repository has no licence file yet; the licence for this art follows whatever the owner chooses
for the project (decision pending).**

## Known limits

- Judged on contact sheets only so far. Whether it feels charming and readable moving and carrying a
  cube on a real phone is confirmed in M10.2/M10.3 and at gate G1.
- Wings are the lightest, largest element; on small screens the coloured body is the part that
  identifies the cube colour.
- Pupils sit inner-bottom (a slightly cross-eyed, cute look): a design choice open to feedback.
- No sleeping or hurt poses; not needed for the slice.
- One body shape. If gate G1 wants a different creature, only this file and its tests change; the
  rest of the pipeline uses frame names.
