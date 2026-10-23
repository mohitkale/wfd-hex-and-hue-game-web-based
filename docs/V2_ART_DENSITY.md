# Art density (M11.2)

_How large a picture can be before cubes get too small, what it costs to draw, and how long it takes
to play. Reproduce the tables with `npm run density`; the checks are in `tools/collect/density.test.ts`._

## What changed

- **Shades.** A level may now carry `shades` (`{ colors, family, cells }`): each cube has a display
  colour that belongs to its colour _family_ (ART_DIRECTION_V2 §1). Gameplay uses only the family,
  so the engine, solver and every rule are unchanged (a test shows the state hash is identical with
  and without shades). The renderer paints each cube in its shade, with a gentler bevel
  (20 % instead of 38 %) so cube edges do not blur the steps of a ramp. Levels without shades look
  exactly as before.
- **Density test board.** `?engine=v2&level=dense` (also `dense24`, `dense40`) is a lit orb of six
  families with four shades each at 32×32 (24 and 40 for comparison). It is a load-test aid, **not
  art**: it is generated, and ART_DIRECTION_V2 §6 says a generated shape can never ship.
- The engine already allowed 40 per side (`COLLECT_LIMITS.maxSize`); the portrait layout needed no change.

## Cube size

CSS pixels per cube (cell pitch, gap included) from the real portrait layout, square boards, four
columns, four slots, four field tiles:

| Device (CSS px)       | 16   | 24   | 32   | 36  | 40  |
| --------------------- | ---- | ---- | ---- | --- | --- |
| iPhone SE 1st gen 320 | 16.5 | 11.5 | 8.5  | 7.5 | 7.0 |
| Galaxy S 360×640      | 18.7 | 13.0 | 9.7  | 8.7 | 8.0 |
| iPhone SE 2nd gen 375 | 19.5 | 13.5 | 10.0 | 9.0 | 8.0 |
| iPhone 15 393         | 20.3 | 14.0 | 10.7 | 9.7 | 8.7 |
| Pixel 7 412           | 21.3 | 14.9 | 11.0 | 9.9 | 9.1 |

Width is the binding side everywhere (the board's height is never the limit for a square board).

**Decision (initial, revisable after a real-phone test):** cubes are at least 7 CSS px on any
supported phone and at least 8 px from 360 px wide; standard pieces stay at or below 32 per side
(at least 8.5 px everywhere); 40 is for hero pieces. The test suite fails if the layout ever drops
below these numbers.

## Cube counts and play time

The test orb on the real engine at 24 ticks a second (1×), 6 colours, squad 5, spawn gap 1, four
working groups, four slots. "Eager" taps the next group as soon as anything is legal; "settled"
waits for the board to settle after every tap (the slowest a player could be):

| Size  | Cubes | Eager bot | Settled bot |
| ----- | ----- | --------- | ----------- |
| 16×16 | 192   | 13 s      | 49 s        |
| 24×24 | 432   | 42 s      | 151 s       |
| 32×32 | 772   | 90 s      | 347 s       |
| 36×36 | 968   | 135 s     | 486 s       |
| 40×40 | 1,208 | 170 s     | 675 s       |

The figures are bot times on a board whose groups are dealt outside-in so it is always finishable;
they are not human times and exclude thinking. Two things to carry into M12: (1) time depends on
squad, spawn gap and field cap as much as on cube count (the slice's 196 cubes took about 100 s with
squad 3 and spawn gap 2), so pacing a large picture is a level-design parameter, not a reason to
shrink art; (2) a piece of 700+ cubes needs a deliberate pacing answer (bigger squads, or more
groups working at once), not the slice's settings.

## Rendering cost

`?engine=v2&level=dense&profile=1`, phone-sized (390×800) pane in the desktop app, dev server
(unminified), four groups started at once, 20 familiars on screen, 101 of 772 cubes delivered when
sampled (see [the screenshot](art/m11.2/dense32-play.jpg)):

| Metric                 | Value                             |
| ---------------------- | --------------------------------- |
| Render submit (median) | 1.3 ms                            |
| Render submit (p95)    | 2.9 ms                            |
| Render submit (max)    | 16.2 ms                           |
| Scene update (median)  | 0.2 ms                            |
| Scene update (p95)     | 3.0 ms                            |
| First full paint       | 9.1 ms (once)                     |
| Pool                   | 20 created, 20 peak, counts match |

The 40×40, 1,600-cube stress board in [V2_PERF.md](V2_PERF.md) measured a median of 1.5 ms and p95 of 3.7 ms on this setup, so
the 32×32 board is comfortably inside the 60 fps budget **here**.

## Not measured

- **A real mid-range phone.** The acceptance wording asks for a reference device; none is available
  to this work, so the 60 fps claim rests on CPU submit time on the desktop pane (which does not
  follow vsync), as in V2_PERF.md. Treat it as an estimate until a person runs the dense board on a
  phone. Together with the cube size above this is a question for G2 or G3, not something CI can answer.
- **Readability of the shades on a phone screen.** The orb shows that ramps are visible at 8-10 px
  cubes in the desktop pane; whether real art reads is judged on M11.3's contact sheets and at G2.
