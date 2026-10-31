# The Hex & Hue cookbook

A reusable guide to building a **pick, carry and deliver picture puzzle** for the web, with Hex & Hue as
the worked example. Use it to make the same game in another theme (food, ocean, space, sports), or as
a reference for a new mobile web game. Each recipe says **what** to build, **why**, and **where** it
lives in this repository. The last part lists the problems we solved to make the play feel good:
symptom, cause, fix.

---

## 1. The game in one page

- A **picture** made of cubes sits on a board. Under it are **columns of boxes**, each box a colour
  and a number: how many cubes of that colour it still needs.
- The player taps the **front box** of a column. It moves into a free **tray**, and from it little
  characters (**familiars**) walk out, each fetching **one cube** of the box's colour from the edge of
  the picture, carrying it to the **hole** and diving in. The box counts down. At zero it is done.
- Every box in a tray works whenever a cube of its colour can be reached. A box whose colour is still
  buried just waits.
- **You lose** when every tray holds a box that cannot work (a deadlock). **You win** when the picture
  is cleared; the finished picture is revealed with its name and a line of lore, and goes into the
  Spellbook.
- **Boosters** (all earnable by playing): an Extra Tray (also rescues a deadlock), a Familiar's Call
  (bring a box forward), a Besom Sweep (fetch buried cubes), the Lantern (see every box to come), a
  Hint (a move the solver proves still wins). **Retry is always free and instant.**
- **Speed:** 1× is free; 3× for one level via an optional rewarded ad. Speed changes presentation only.
- **Never block play:** no lives, energy, timers, paywalls or forced ads.

The rules are specified in `docs/GAME_DESIGN_V2.md`.

---

## 2. Stack and libraries

| Layer      | Choice                                                  | Why                                                                       |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Language   | TypeScript (strict, ES modules), Node 24                | One language for engine, renderer, tools and site; types catch rule bugs  |
| Repo       | npm workspaces: `packages/*`, `apps/web`                | Engine, renderer and site version together; tools import them directly    |
| Engine     | Plain TS (`packages/core`), no dependencies             | Deterministic, testable, runs in Node for the solver and simulations      |
| Renderer   | Phaser 4 (WebGL, canvas fallback)                       | Batched sprites, cameras, tweens, input; one canvas, full-bleed           |
| Site       | Astro (static)                                          | Fast landing, blog, FAQ, gallery pages; the game is one island at `/play` |
| Images     | pngjs (build time)                                      | Share cards and gallery art rendered from the level data, no assets       |
| Tests      | Vitest                                                  | Fast, TS-native; 1,400+ tests, including whole-level checks               |
| Tools      | tsx scripts in `tools/`                                 | Level dealing, reports, art sheets, budgets: all plain TS                 |
| Quality    | ESLint, Prettier, `npm run verify`                      | One command must pass before any PR                                       |
| Offline    | Service worker + web manifest (PWA)                     | Plays offline once loaded; installable                                    |
| Ads, stats | Provider-agnostic interfaces (`rewards/`, `analytics/`) | The engine never imports a vendor SDK; a failed ad never blocks play      |
| CI         | GitHub Actions                                          | Runs `verify`; the production gate fails on a broken or stale level       |

---

## 3. Architecture

```
packages/core/src/collect   the rules: state, actions, tick simulation, routes, solver, players
packages/game/src/collect   the board scene, familiars, home map, Spellbook, art, journey levels
apps/web                    Astro site; /play mounts the game
tools/collect               dealing levels, the production gate, reports
```

**Recipe: split the rules from the pictures.**

1. The engine state is **plain serializable data**. It advances in whole **ticks** (one cell walked
   per tick). It uses seeded random numbers only: no `Date.now()` or `Math.random()` in rules.
2. Every change comes out as an **event stream** (`cubePickedUp`, `cubeDelivered`, `slotAdded`…).
3. The renderer keeps a **visual model** built from the events and interpolates between ticks
   (`alpha` 0..1). It never mutates game state.
4. A **tick clock** turns frame time into ticks. Speed multiplies ticks per second, so 1× and 3×
   play out identically (`tickClock.ts`).

Why: the same engine runs in the browser, the solver, the simulated players and the tests. A level
proven winnable offline is winnable in the game.

---

## 4. Recipe: proving every level

1. **Solver** (`core/src/collect/solver.ts`): searches the settled states (between player choices) and
   returns a winning line, or proves the level unsolvable. It plays with the game's own policy
   (waiting boxes resume by themselves). **No level ships unless the solver wins it** and the line
   replays to a win in a live session.
2. **Simulated players** (`players.ts`): nine cheap strategies (always the leftmost column, round
   robin, largest box first…) plus 200 seeded random tappers. They stand in for careless play.
3. **Difficulty bands** (`content/difficulty.ts`): what each tier allows the cheap players to win.
4. **Production gate** (`tools/collect/production.ts`): every reachable level is validated, solved,
   replayed and played by the cheap players. Each level must fit its tier. The result goes into a
   committed report (`docs/V2_PRODUCTION_REPORT.md`), and CI fails if the report is stale.

Tier targets used by the journey (`TARGET` in `tools/collect/journey.ts`):

| Tier    | Cheap strategies                    | Random tapping wins |
| ------- | ----------------------------------- | ------------------- |
| Easy    | may win                             | 30–100 %            |
| Medium  | column-spam must lose (medium band) | 5–45 %              |
| Hard    | medium band                         | ≤ 25 %              |
| Extreme | medium band                         | ≤ 10 %              |

---

## 5. Recipe: the level pipeline (picture → board → deal → gate)

1. **Draw the picture in code** (`journeyArtA.ts`, `journeyArtB.ts`) on a `Canvas`
   (`pixelCanvas.ts`): discs, rings, polygons, lines, stars, a 3×5 pixel font for words, and
   `outline()` for the bordered look. Pictures are 22–34 cells wide. A chapter finale draws its own
   background and carries a word.
2. **Give it a canvas.** Every other picture gets a background (`bg` in `journey.ts`: night navy,
   sky blue, parchment, deep purple) with a scatter of stars that never touch the art. **Every cell
   of every board is a cube**, so the board looks like the finished picture in the win reveal and the
   art pops out of it. The background is also the outermost layer to clear, so it buries the art a
   little: part of the difficulty comes for free. Then make the board (`toPictureBoard`, `margin: false, scene: false`): one box
   per colour to start.
3. **Shape the board** (`withSharedTrays`): trays and columns from the cube count (3–4 trays on a
   small picture, 5 on a large one). **Difficulty never comes from fewer trays.**
4. **Deal it** (`npm run journey:deal`): cut the boxes to a size (smaller boxes mean more choices),
   then hill-climb the order of the boxes in the columns. A change is kept only if the solver still
   wins and the cheap players move toward the tier. If that is not enough, add **wax seals**: half of
   one colour's inner cubes wait until every box of another colour is finished. Seals are an extra
   rule to learn, so they are allowed only on hard and extreme levels **from chapter 3 on**
   (`sealsAllowed`); easy and medium levels and the first two chapters never have them. The deal is
   recorded in `journeyDeals.json`.
5. **Gate it** (`npm run production:check`), then review it on the art sheet (`npm run art:journey`).

To add a level: draw a function, add it to a chapter in `journey.ts`, run `journey:deal` for it,
then regenerate the production report.

---

## 6. Recipe: pixel art that reads on a phone

- **One fixed palette** (`PICTURE_PALETTE`, 19 colours): every pair is at least **ΔE 27** apart
  (CIELAB), so no two neighbours blur together. Test: `pixelCanvas.test.ts`.
- **Families** (red/pink, yellow/orange/ochre, tan/brown, the greens, blues, purples, greys): shades
  of one colour are not outlined from each other, so shading reads as shading.
- **Bordered style:** `outline(black, { families })` adds a one-cell line round the picture and
  between colours of different families. Details drawn after the line (eyes, sparkles, letters)
  stay crisp. For a dark subject on a dark sky, `around: [black]` draws a light line round it only.
- **At most 10 colours per level:** each colour needs its own colour-blind symbol.
- **Words** in a 3×5 font: up to 8 letters on a 32-cell board, two lines when needed.
- **Box numbers** are white on the box's dark tone, deepened until it reaches 3.5:1 contrast.
- **Cube size:** at most 16 css px, and a familiar is about two cubes wide.
- **Art sheet:** every picture rendered as cubes at phone size, for a human to review before release.

---

## 7. Recipe: rendering for mid-range phones

- **Bake everything static** into textures once (the table, the board, cubes, trays). A frame then
  draws a few hundred textured quads.
- **One atlas** for the characters: species × colour × 16 frames, drawn from vector shapes at 4×
  supersampling, linear filtering.
- **Pool sprites**; allocate nothing per frame.
- **Device pixel ratio capped at 2** and about 1.5 MP of canvas, with **no MSAA**. The board is
  fill-rate bound on integrated GPUs, and baked art stays sharp at 2×.
- **30 frames a second cap**, and an **idle loop** (`idleLoop.ts`) that stops drawing when nothing
  moves. Any touch, key or resize wakes it. Animations are timed in ms, so the cap changes nothing
  but drawing.
- **Budget in CI** (`tools/perf`): play page JS ≤ 450 KB gzip (Phaser is about 390 KB), each HTML
  page ≤ 20 KB, the whole deploy ≤ 3 MB.

---

## 8. Recipe: characters that feel alive

0. **Draw them from above**, head leading, each with its own anatomy (six legs in tripods for an
   ant, eight jointed legs for a spider, paws and a tail for a cat). A front-facing character always
   looks out at the player, whichever way it walks.
1. **Walk cycle from distance, not time:** 6 walk and 6 carry frames per stride. The frame shown
   comes from the distance walked (`strideCycle`), so the feet never slide and 3× moves the legs 3×
   faster.
2. **A gait per species** (`gait.ts`), following the same stride: the bat's wingbeat, the owl's glide
   and sway, the cat's trot, the frog's hop with a landing squash, the ant's scurry, the spider's
   rocking scuttle.
3. **Face the way you go:** heading = `atan2(dx, -dy)` of the move, eased round corners over about
   70 ms, turning **about the sprite's middle**, so a turn never shifts where it stands. The carried
   cube sits at the head, wherever the head points.
4. **Into the hole:** keep walking pace. Turn head-first and slide in, cropping everything past the
   opening's near edge. The hole's front lip is drawn over the sprites, so they really go _in_.
   Each character has its own **lane** across the opening, so arrivals never stack.
5. **Small joys** (cosmetic only): combos ("Nice!", "Great!", "Wonderful!", "Spellbinding!"), a tap
   on a familiar makes it jump and spin, and a dust puff at the rim.

---

## 9. Recipe: screens

- **Home map** (`LevelSelectScene.ts`, `levelMap.ts`): a tall night sky on **its own camera**,
  scrolled by dragging, with a flick that glides on (exponential decay) and the mouse wheel.
  - A winding trail of stepping stones, gold up to the next level.
  - Stops: gold coins for cleared levels; the next one glowing, with the chosen familiar hopping
    beside it; locked stones that shake when tapped.
  - Chapter ribbons, and landmarks in each chapter's theme.
  - It opens on the next level. A tap is told from a drag by a 10 css px slop.
- **Spellbook:** the pictures by chapter, silhouettes until collected, pages with lore and replay.
- **Win:** the picture is revealed, then you return home. **Loss:** "Stuck" says why; offers Retry
  (free) and an Extra Tray when one would free the trays.

---

## 10. Recipe: fit any screen, never scroll

- `/play` is `position: fixed; inset: 0; height: 100dvh`, with `overflow: hidden`, `touch-action:
none` and `overscroll-behavior: none`.
- Resize on `window` **and `visualViewport`** (toolbars sliding in and out), coalesced to one per
  frame.
- Safe-area insets (notch, home bar) are read from `env(safe-area-inset-*)` and laid out around.
- **The layout is a pure function** (`collectLayout.ts`) of the screen, the board and tray counts,
  tested over a device matrix (`deviceMatrix.ts`: 320×568 up to tablets and landscape phones):
  - nothing leaves the screen;
  - cubes stay at least 7 css px;
  - tap targets are at least 44 css px;
  - box numbers are at least 14 css px.

---

## 11. Recipe: rewards without walls

- Coins come from first clears, scaled by size. Hard levels pay 20 more and extreme ones 40; a replay
  pays a token. Every third first clear gives a power-up. A starting kit has one of each.
- A booster that cannot do anything costs nothing. Running short of coins is never a wall: the
  message says Retry is free.
- Ads are optional, rewarded and behind an interface. With no working provider, no ad is offered.

---

## 12. Problems we solved to make the play enjoyable

| Symptom (as the owner saw it)                                                         | Cause                                                                                      | Fix                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The first engine felt like sorting, not like creatures fetching things                | A track-around mechanic                                                                    | A new engine: familiars pick up, carry and deliver; a box's number is real remaining capacity; poor choices can deadlock                                         |
| Tapping random boxes won every level                                                  | Open pictures: nearly every colour reachable from the start, so trays never jam            | Bordered pictures (outlines bury the inside), full-board finales, smaller boxes, a hill-climbed box order, wax seals; every level checked against random tapping |
| "Hard" levels just had fewer trays                                                    | Trays were the only lever                                                                  | Hard levels keep the normal trays; difficulty comes from the picture and the deal                                                                                |
| Movement looked choppy and robotic                                                    | 14 fps cap; two walk frames flipped once per tick                                          | 30 fps cap with idle sleep; a 6-frame walk cycle driven by distance walked; a gait per species                                                                   |
| Characters always faced up, whichever way they walked                                 | Front-facing sprites with no heading                                                       | Heading from the move, eased round corners, turning about the middle; the cube rides at the head                                                                 |
| Characters slowed down and piled up at the hole                                       | Each stopped at the centre and sank for half a second                                      | They keep walking pace head-first into their own lane of the opening (0.2 s dives)                                                                               |
| A third of the character stayed visible "in" the hole                                 | The dive was a few frames long, and a dark patch covered it                                | A hollow hole (lit inner wall, dark floor) with its front lip drawn over the sprites; crop at the near edge                                                      |
| Some characters vanished while their cubes kept moving                                | A shared "reached the hole" flag was not reset per character                               | Reset it on every placement; the cube now goes into the hole with its character                                                                                  |
| Cubes blinked at the hole and squares scattered below it                              | A second delivery cube and coloured sparks left over from an older look                    | Removed both; only a soft dust puff remains                                                                                                                      |
| 1× looked like 3× on small pictures and like 0.25× on big ones                        | Speed was set in cells per second                                                          | Speed is set in css px per second; everything counted in ticks scales with board width                                                                           |
| Filler cubes made levels long and dull                                                | Every picture was padded with sky and ground                                               | Pictures play as drawn, on a background designed for each one (night sky with stars, parchment, sky) instead of generic sky and ground                           |
| The board looked incomplete next to the win reveal                                    | Sparse pictures left most of the board empty and light; the reveal sits on a dark backdrop | Every picture fills its whole board with a designed background, so the art pops out of a complete canvas on the board too                                        |
| Early levels had puzzling extra rules                                                 | Wax seals were used wherever the deal alone fell short                                     | Seals only on hard and extreme levels from chapter 3 on; a test enforces it                                                                                      |
| A brown shade went missing; neighbouring colours looked alike                         | A palette without that shade, and colours too close                                        | Ochre added; the palette spread to ΔE ≥ 27; shades grouped in families; outlines between colours                                                                 |
| Two-box puzzles showed five trays                                                     | One tray count for every board                                                             | Trays from the cube and box counts (3–4 small, 5 large), never more than the boxes                                                                               |
| Laptops ran hot and dropped frames                                                    | Full-resolution canvas with 4× MSAA redrawn every frame                                    | DPR ≤ 2, ~1.5 MP, MSAA off, baked textures, 30 fps cap, idle sleep                                                                                               |
| The level list was squeezed onto one screen                                           | All stops scaled to fit the view                                                           | A scrollable map on its own camera with a flick, chapters and landmarks                                                                                          |
| Undo turned deadlocks into trial and error                                            | Free, unlimited undo                                                                       | Undo removed; Retry is free and instant; an Extra Tray can rescue a jam                                                                                          |
| White numbers were hard to read on yellow boxes                                       | The badge's dark tone was not dark enough                                                  | The dark tone is deepened until white on it reaches 3.5:1                                                                                                        |
| Characters looked at the player whatever way they walked; an ant seemed to have wings | Front-facing sprites; legs drawn as thick arches                                           | Every species drawn from above with its real anatomy, turned to its heading                                                                                      |
| Boxes behind the front row were hard to read                                          | They faded to 62 % and 42 %                                                                | Every box flat and fully opaque; the front box has a soft sheen; a working box shows a curved tray rising out of it                                              |
| Mobile toolbars could cover the bottom of the board                                   | The game box was sized to the layout viewport                                              | `100dvh` plus `visualViewport` resize events                                                                                                                     |

---

## 13. Reusing it for a new theme

1. **Keep:** `packages/core` (rules, solver, players), the tick clock, the layout, the familiar
   renderer, the map, the dealing tool and the gates.
2. **Replace:**
   - the pictures (`journeyArt*.ts`) and the chapters and lore (`journey.ts`);
   - the palette, if your theme needs other colours (keep every pair ΔE ≥ 27);
   - the species and their gaits (`familiarDraw.ts`, `gait.ts`);
   - the map's landmarks (`mapDecor.ts`);
   - the copy.
3. **Tune:** the tier targets (`TARGET`), box sizes, walking speed (`WALK_CSS_PER_SECOND`) and the
   frame cap.
4. **Run, in order:** `npm run art:journey` (review the art), `npm run journey:deal`,
   `npm run production:report`, `npm run verify`. Then playtest with real people: simulated players
   prove a level is not trivial, never that it is fun.

---

## 14. Commands

```
npm run dev               # site and game at /play
npm run verify            # lint, format, types, tests, art and level gates, build, budget
npm run art:journey       # dist/journey-sheet.html: the journey pictures at phone size
npm run journey:deal      # deal journey levels that have no deal (`-- <id>` to redo one)
npm run production:report # the production gate's report (docs/V2_PRODUCTION_REPORT.md)
npm run budget            # performance budget of the production build
```
