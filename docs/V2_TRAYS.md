# Shared trays: every tray works (M15.13)

Owner feedback round 6 ([V2_PLAYTEST.md](V2_PLAYTEST.md) items 19 to 23). The reference game sends
characters out of **every** occupied tray; ours had two kinds of tray (`fieldCap` working places and
`slots` waiting places) shown as one row. That made three of the reported problems:

- A box could sleep ("zz") in a tray while its colour was plainly reachable, because the working
  places were taken.
- Queued boxes filled the waiting places, so the next box that ran dry lost the game ("Out of slots").
  Undo only takes back the last tap, so after Undo the same trap was still set and the game ended
  again.
- Only two boxes worked at once with three familiars each, so the familiars dashed (14 cells a
  second) while the picture cleared slowly. That was the sluggish feel; the profiler showed the scene
  itself costs about 0.2 ms of update and 2 ms of render submit per frame, with no growth of sprites
  or objects over time.

## The rule (`CollectLevel.sharedTrays`)

- There are `slots` trays, and `fieldCap` equals `slots`.
- A tapped box takes a free tray. In its tray it works whenever a cube of its colour can be reached,
  and waits there otherwise; it resumes by itself (auto-resume) the moment it can work again.
- A tap needs a free tray. With every tray taken the tap is refused ("Every tray is busy").
- `slotsFull` cannot happen. The game is lost only when nothing can work and no tap can help: every
  tray holds a stuck box, or no column holds a box that could work (`deadlock`).
- Extra Slot adds a tray that works like the others. After a deadlock it is offered, and revives the
  game, only when the new tray makes the board playable again.

The solver, hints and simulated players use the engine's `explain`/`apply`, so they play by the same
rule. Levels without the flag keep the original rule; the tutorial does, until its slot and undo
lessons are rewritten for shared trays.

## One cube per familiar, and the counter (owner feedback, same day)

- A familiar comes out of its box's tray, fetches **one** cube and carries it into the **hole** between
  the picture and the trays; it is never sent out again. The next cube is fetched by a new familiar.
- The number on a box in a tray is the familiars still inside it: it drops when one comes out. At 0
  the box leaves the tray at once (no 0 is shown) and the tray is free, while its last familiars
  finish carrying their cubes (`freeTrays` no longer counts a working box with none left inside).
- A tray opens when its box has landed, and familiars only come out of an open tray.

## Paths: tray, edge, hole (owner feedback, same day)

- **Edge gate** (`edgeGate`): distances are measured from the whole margin row under the picture, so
  each familiar's route meets the board at the bottom-edge cell nearest its cube instead of all at
  one portal cell. It walks back along the same route (no second path is computed).
- **Gate** (`gate`, 10 ticks): the first steps of every route are spent off the board. Going out, the
  familiar climbs straight up from its tray (stepping round the hole when the tray is under it) to the
  bottom edge and along it to its edge cell; coming back, it goes from its edge cell straight to the
  hole on a diagonal. Familiars spread along the edge instead of stacking on one line.
- Familiars only ever walk through open cells. Besom Sweep no longer flies over cubes: the familiar
  walks to the walkway cell nearest the buried cube and pulls the cube out from there.

## Speed

The walk is a fixed on-screen speed, `WALK_CSS_PER_SECOND` (150 css px a second at 1×); the tick rate
follows the cell size (`ticksPerSecondFor`). Speed used to be cells a second, which looked fast on the
slice (22 px cells) and crawled on the art pictures (10 px cells). Up to 12 familiars of a box are out
at once, one leaving every 3 ticks, so a tray sends out a steady stream.

## Performance

On an Intel UHD 630 the board ran at 30 fps although the scene's own work was 2–4 ms a frame; route
finding is part of that and is not the cost (one incremental distance map, one route per familiar).
What was changed:

- No multisampling and at most 2× pixel ratio, about 1.5 MP (`V2_BUDGET` in `display.ts`).
- **The loop sleeps while the board is still** (`idleLoop.ts`): nothing is drawn while the player is
  thinking; any touch, key or resize wakes it. Before, the GPU redrew the whole screen 60 times a
  second even when nothing moved, which kept laptops hot.
- No carry trails, drifting motes, familiar shadows, reserved-cube rings or box glows.

Measured afterwards in the app's browser pane: busy play with up to 50 familiars holds 60 fps in
the typical frame on a phone-sized view; a large desktop window still drops toward 30 fps while busy,
with the scene's work at about 2 ms, so the remaining cost is outside the game's code (the GPU
compositing the page).

## Nothing carries over

A retry, a restart or another level is a fresh attempt: extra trays, the Crystal Lantern, 3× and a
Besom Sweep in progress all end with the attempt they were bought for. Stock in the pouch is kept.

## What the board plays

`withSharedTrays` (`packages/game/src/collect/trayRules.ts`) is applied to the slice and every art
level (and so the daily): squads of 12, a familiar leaving every 3 ticks, and a board shape that follows
the picture's size and its boxes (`boardShape`): under 400 cubes 3 trays (4 with more than 6 boxes)
and 3 columns of boxes, otherwise 5 trays and 4 columns, and never more trays or columns than boxes (the
two-box tutorial shows two trays). Boxes are dealt into the columns front row first (`redeal`), so what the level put near
the front stays near the front. The production gate checks the levels exactly as
they are played. `art-black-cat` is now tutorial-grade at any tray count and is recorded as a known
deviation, like the other single-layer pictures.

## Picture boards (owner direction, same day)

Every played board is a **picture board** (`pictureBoard.ts`), like the reference game:

- One fixed palette for every puzzle: red, orange, yellow, light green, dark green, sky blue, blue,
  purple, grey, black, white and brown. Each art colour is named the way a person would (dull colours
  become black, grey or white by lightness, so a slate cat is black; others go by hue).
- **A cube's colour is its box's colour**: no shades inside a colour.
- **The whole board is filled**: the picture in its key colours, every other cell in one background
  colour the picture does not use (sky blue, else light green, yellow, white, grey).
- New boxes are generated to match (each colour split into boxes of at most 40, ordered from the
  outside of the board in), and the production gate verifies every board.
- The finished picture (reveal, Spellbook) shows exactly the played colours.
- Livelier (second pass): vivid colours (pink added), a **black outline** round the picture (every
  empty cell touching it), a simple **scene** behind it (sky above, ground below the bottom 22%),
  and cubes with a lit top and a softly shaded bottom.
- Shape and density (third pass): purple, blue, green, brown and grey have light, mid and dark
  versions (each its own colour and boxes), so a picture keeps its shading; each cube is drawn as a
  distinct block (a line between cubes, lit top and left, shaded bottom and right); a picture under 24
  cubes wide is doubled (each art pixel 2×2 cubes); boxes go up to 80 (the solver proves every board).
- Fourth pass: every board is up to 40×40 (the engine limit), the picture centred with a scene round
  it (about twice the cubes); cubes are square 3D blocks with depth: a darker front face shows below a
  cube wherever the cell below is open, so open edges look like stacked blocks (`CubeLayer`);
  **edge-first routes** (`edgeBias` 3): a step inside the picture costs 3 against 1 on its margin, so
  familiars walk up the left, right and top edges and cut in near their cube, keeping the middle clear.
  A level now takes about 4½ to 7½ minutes at 1× for a quick player.
- **Stream** (later the same day): a familiar leaves a tray about every 0.2 s (`spawnGap` scaled by
  width; measured 0.22 s on Black Cat), about one and a half familiars apart, with up to 40 of a box
  out at once so the stream never waits; a level now takes about 1¼ to 2 minutes at 1× for a quick
  player. The box number just changes (no pop) and the box no longer bumps on each delivery.
- **Two fronts** (`rowTarget`): a colour is worked from the bottom front (lowest reachable row in the
  lower half) and the top front (highest reachable row in the upper half, reached along the side and
  top edges and worked downward), picks alternating between them; in a front about a third of picks
  take the next row, so rows of one colour are not finished strictly one by one.
- **Row order** (`rowTargets`, `rowTarget` in `targeting.ts`): a familiar takes the lowest row that
  holds a cube of its colour it can reach, and in it the cube nearest the board's centre on one side,
  the sides taking turns (left, right, left...; the other side when one has none). A row empties from
  the middle out, about equally to both edges, then the next row up. Routes are unchanged
  (edge-first).
- **3× and the tray** (`openDelay`): a newly chosen box's first familiar waits a few ticks while its
  tray opens; counted in ticks it shrinks with 3×, and the box's move and the lid's opening play at the
  shown speed too, so at 3× the familiars are seen climbing out of the tray (before, the fixed 0.38 s
  opening hid the first third of the climb).
- **Into the hole**: during its last step a familiar shrinks and sinks below the rim, then its retire
  finishes the dive; a small tan dust puff kicks up at the rim.
- Calmer: at most 6 familiars of a box out at once, leaving 4 ticks apart (scaled by board width), and
  a minimum familiar size of 22 css px.
- Taps while the last column re-centres: boxes snap to their new place at once (their tap zones
  move at once too), and within a column a box only slides vertically.

## Home screen, familiars and drawn pictures (owner request, next day)

- **Choose a familiar**: the home screen (`LevelSelectScene`) has a "Your familiar" row with six
  species — bat, cat, ant, owl, frog and spider (`familiarDraw.ts`). The choice is kept locally
  (`hexhue.v2.familiar`, `familiarChoice.ts`) and plays every level; with no choice a level uses the
  species its picture suggests.
- **Progress line**: the levels are stops on a winding line, first at the bottom (`mapNode`). A stop is
  done (✓), open (its number) or locked (🔒): the first level is always open and each later one opens
  once the one before it is cleared (`lineStatus`). Finished levels can be replayed.
- **Drawn pictures** (`pictureArt.ts`): Crystal Ball, Witch's Potion, Moon Owl and Toadstool, drawn in
  code from shapes in the picture palette and played as picture boards (40×40 with the scene and
  outline). They follow the art library on the line and are in the production inventory. Like the
  other picture boards they are solvable but cheap play wins them (recorded in `KNOWN`).
- A small island of a colour inside its black outline (a lone sparkle) can be dealt before the
  outline's box, and the solver does not model queueing; the potion lost its two sparkles to stay
  solver-verified.

## Owner feedback round (same week): style, smaller cubes, no filler

- **Each familiar moves its own way** (`gait.ts`, cosmetic): the bat flutters, the owl glides and
  sways, the cat trots with a forward lean, the frog hops in arcs and squashes on landing, the ant
  scurries, and the spider scuttles with a side-to-side wobble. The tilt leans the way it walks.
- **The chosen familiar** on the home screen has a purple-and-gold ring, is drawn larger, carries a
  green tick, and the others are dimmed.
- **Cube size**: cubes are at most 16 css px (`MAX_CELL_CSS`), and familiars are drawn about two cubes
  wide (`familiarScale`: 24 to 34 css px), so a cube reads as half a familiar.
- **No filler cubes**: the sky, ground and outline are filled in only when the picture covers at least
  70% of its own canvas (a busy picture, like the slice's). Other pictures are played as the picture
  alone on an empty board, which cut the art levels from 1,600 cubes to 300–575. The outline is only
  added beside light edges, so a picture with its own dark edge does not get a second, thicker one.
- **Into the hole**: the hole is drawn hollow (the far inside wall lit near the top, the floor darker
  below) and its front lip is drawn over the familiars (`paintHoleFront`). A familiar going in is
  narrowed to fit the opening and slides down behind the lip, cut off at the opening's near edge, over
  about half a second (timed on its own, so it shows over several frames at 14 fps), until nothing is
  left.
- **Steady pace to the hole**: from its bottom-edge cell a familiar walks to the hole at the board's
  pace (a cell a tick) instead of spreading the walk over the whole gate, which made short trips crawl;
  it arrives early and goes straight in. Its cube goes down the hole with it; no second cube drops in
  and no sparks fly (they fell round the hole like stray cubes), only a soft dust puff at the rim.
- **Ochre**: the picture palette has a dark gold (`ochre`) for the shaded side of yellow things, so the
  crescent moon (and four other pictures) keep their brown-gold shading instead of turning plain
  yellow.
- **No margin filler**: a picture that fills its canvas (the slice) is played without the sky, ground
  and outline round it: only gaps inside the picture's own canvas are ever filled (the slice went from
  1,444 cubes to 784).
- **The win shows the picture again**: the slice (Moonlit Hat) now has a subject, so its win reveals the
  finished picture with its name and lore like every art level.
- **Fun** (cosmetic, never changes play or rewards): boxes finished within 3 s of play of each other
  make a streak that pops "Nice!", "Great!", "Wonderful!", "Spellbinding!" (`combo.ts`) with more
  sparks; tapping a familiar on the board makes it jump and spin for joy.

## Owner feedback round 5 (M15.13): a natural walk, and levels that careless play loses

- **30 fps**: the board was capped at 14 frames a second to be lighter on laptops; the owner found the
  familiars' movement choppy next to the reference game. 60 was tried (57 fps measured at phone size
  in the app's browser pane) and the owner chose 30 (`V2_FPS`), as busy boards had struggled to hold 60
  on integrated GPUs. It is the only thing the cap changes: ticks, the walk cycle and the dive are
  timed in ms, so speeds are the same at any frame rate. A still board still draws nothing (`IdleLoop`).
- **A real walk cycle**: walking and carrying are six frames each (`walk0`–`walk5`, `carry0`–`carry5`),
  one stride drawn at six points: feet lift in turn, the ant's legs move in two tripods, the spider's in
  alternate pairs, the frog's hind legs push out and tuck in, the bat's and owl's wings beat. The frame
  shown follows the distance walked (`strideCycle`, a stride per `STRIDE_CSS` css px), not the clock,
  so the feet keep pace with the ground at 1× and 3×; the bob, tilt, hop and squash of `gait.ts`
  follow the same stride, so the body rises and lands in step with the legs.
- **Hard and Extreme levels** (`challenges.ts`): with every tray working, a picture played open (most
  colours reachable from the start) is won by random tapping every time. A Hard or Extreme level is a
  picture dealt so that it is not: smaller boxes (at most 20–40 cubes), two or three trays, and a box
  order that puts boxes whose colour is still buried at the front. Some are **sealed**: the picture
  gets an outline ring and nothing else (no sky or ground), so its inside opens up only as the outside
  is cleared. A jam ("Stuck") is rescued by an Extra Tray (offered on the card when one more tray
  would free it), a Familiar's Call, the Lantern, or a free Retry.
  - The deals are found offline (`npx tsx tools/collect/challenges.ts [id]`, minutes per level) and
    recorded in `challengeDeals.json`. The search keeps only orders the solver wins under the game's
    own policy, until the cheap players fit the tier: Hard meets the **medium** band (column-spam
    loses, at most three simple players win, random wins 5–45%), Extreme the **hard** band (at most one
    simple player wins, random wins at most 25%). The production gate checks every deal again with the
    full 200 random runs.
  - On the level line each Hard level comes right after its own picture, and the Extreme levels close
    the line. Their stops wear a purple (Hard) or red (Extreme) ring and a tag; the level says what it
    is as it opens; a first clear pays 20 (Hard) or 40 (Extreme) coins more.

## Owner feedback round 6 (M15.13): facing, the way into the hole, the level map

- **Facing the way it goes**: a familiar's head and body point the way it walks (`headingOf`), turning
  smoothly at corners (`turnToward`, about 70 ms) and about its middle, so turning never shifts where
  it stands; in its tray it faces up, and the cube it carries is held at its head, wherever that points.
- **Into the hole at walking pace**: the dive no longer starts with a stop and a half-second drop at
  the hole's centre. A familiar goes on from wherever it reaches the hole, at the pace it walked (a cell
  a tick, 0.15–0.4 s), turning head down, into its own lane of the opening (spread over 90% of its
  width), cut off at the opening's near edge. Familiars arriving together go in side by side instead
  of piling up on one spot. Measured: 57 dives, 0.19–0.28 s each, none moving backwards, 37 lanes.
- **The level map** (`levelMap.ts`, `LevelSelectScene.ts`): a tall night sky that is dragged (with a
  flick that glides on) or scrolled, instead of every level squeezed onto one screen. Stops are a
  fixed 112 css px apart on a winding trail of stepping stones (gold up to the next level), so the map
  grows with the levels; it opens on the next level. Cleared stops are gold coins with a tick, the next
  one glows and the chosen familiar hops beside it, later ones are locked stones (a tap makes one shake);
  Hard and Extreme stops wear a purple or red ring and a tag. Moons, crystals, toadstools, candles,
  potions and twinkles (`mapDecor.ts`) line the edges, a few stars twinkle, the sky runs from dusk at
  the start to midnight at the far end ("More spells are brewing…"). The header shows coins and how
  many levels are cleared; the picker and the buttons sit on a wooden shelf. The screen stops drawing
  4 s after the last touch.

## Round 7 (M15.14): v2 only, the witch's journey, hard without fewer trays

- **v2 only.** v1 is gone from the code: its engine, scenes, levels, tools and their tests. `/play`
  mounts the board with no flag. The core keeps the collect engine, the seeded random numbers and the
  ASCII art parser.
- **The witch's journey** (`journey.ts`): 24 pictures in six chapters (The Calling, Hedge & Herbs,
  Crystals, Moon & Stars, Familiars & Spirits, The Grimoire), easy → medium → hard → extreme finale.
  - They are drawn in code in the bordered style (`journeyArtA.ts`, `journeyArtB.ts` on
    `pixelCanvas.ts`). Each finale fills its whole board and carries a word ("BLESSED BE", "BREW",
    "CHARGE", "AS ABOVE / SO BELOW", "SAMHAIN", "SO MOTE IT BE").
  - Each level plays exactly as drawn: no scene or margin is added.
  - Review sheet: `npm run art:journey`.
- **Hard is not fewer trays** (owner rule). Every level keeps the trays and columns of its board
  (`boardShape`). Its difficulty comes from the picture (outlines bury the inside), the box size and
  order, and, where that is not enough, wax seals. The deals are found offline (`npm run
journey:deal`, recorded in `journeyDeals.json`). The production gate holds each level to its tier:
  random tapping wins at most 45 % of medium, 25 % of hard and 10 % of extreme levels, and
  column-spam loses them.
- **Colours.** The palette is spread so every pair is at least ΔE 27 apart (navy, the purples and
  the greys moved). Shades of one colour are not outlined from each other. A level uses at most 10
  colours. White box numbers are at least 3.5:1 on every colour.
- **The map** shows chapter ribbons and each chapter's landmarks; it opens straight away, with no
  board flashing first.
- **Fit.** `/play` follows the visible viewport (`100dvh`, `visualViewport` resize), so a phone's
  toolbars never cover the boxes. Every journey level is checked on the device matrix.
- **The site.** The landing gallery, `/spellbook` and the share images show the journey's pictures.
