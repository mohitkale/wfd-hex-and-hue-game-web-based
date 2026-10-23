# Art direction v2: the pixel-art bible

_M11.1. The rules every v2 picture is drawn and reviewed against. M11.2 sizes the grid, M11.4 turns
the rules marked **[check]** into `npm run art:check`, M11.3 draws the representative set, and the
human gate G2 asks whether that set meets this bible. Numbers marked **initial** are starting
points that M11.2 (mobile measurement) and M11.3 (the first real pieces) may revise; any change is
recorded in the table at the end, not made silently._

## Why this exists

In v2 the picture **is the puzzle**: you peel it cube by cube, then it is revealed whole and kept
in the Spellbook. The v1 art was 10-16 cell shapes with one flat colour per part (a crescent on a
full rectangle of sky; a candle jar of four colours). That is enough for a track game, but it is
the wrong foundation for a game whose reward is the finished picture. v2 pictures must look like
small, deliberate illustrations of witchy things, and must stay readable when every cell is a
12-24 px cube on a dark board.

## 1. What a picture is

- **A subject on the dark board.** The picture is a silhouette of one clear subject (a moon, a
  cauldron, an amethyst cluster, a zodiac figure, a familiar). Empty cells are the board, not a
  backdrop to be filled in.
- **A grid of cubes.** One cell = one cube = one delivery. Cell count is play time (about 0.5 s of
  1× board time per cube in the slice), so every cell must earn its place (section 5).
- **Colour families and ramps.** The player matches familiars to cubes by _family_ (gameplay
  colour). Shading inside a family is a **ramp** of 2-5 shades. A cube's shade is how it looks;
  its family is what a group collects. (The engine-side change this needs, a per-cell shade on
  top of the family index, is delivered by M11.2 and M11.4, not here.)

## 2. Size and density (initial; M11.2 measures them)

| Piece kind       | Grid per side | Meaningful cells (typical) | Use                                        |
| ---------------- | ------------- | -------------------------- | ------------------------------------------ |
| Tutorial / short | 16-24         | 120-300                    | First levels of a world, teach a mechanic  |
| Standard         | 24-32         | 300-650                    | The normal Spellbook piece                 |
| Hero             | 32-40         | 600-1,000                  | World finales; the engine's limit is 40×40 |

- **A-01 [check]** Grid 16-40 per side and 120-1,000 filled cells; outside that needs a written reason.
- **A-02 [check]** A piece fills its grid: the subject's bounding box spans at least 85 % of the
  grid's width or of its height, so no tiny picture swims in a big frame.
- **A-03 [check]** At least 3 of the 4 corner cells are empty (the silhouette rule), and at least
  10 % of all cells are empty.
- Smallest cube on a 320 px-wide phone: decided by M11.2 from measurement (hypothesis: 8 CSS px,
  which makes 32 per side the practical default and 40 a hero-only size).
- Play time is part of the design: a 600-cube piece is about five minutes at 1×. M11.2 reports
  cube count and expected duration per size, and the level design (M12) decides how a long piece is
  paced, not this document.

## 3. Colour: families and ramps

### The house families

Pictures draw from one shared set of **10 families**, so the whole game looks like one world and
players learn one palette. Each ramp is _deep → shade → base → light → glint_; the base is the
gameplay colour. Hexes are the base mixed toward the board's deep violet (`#1c0f3a`, 50 % and
28 %) and toward white (35 % and 65 %); the last column is the lowest contrast against the board
panel (`#0f0824`, floor 1.6).

| Family    | deep      | shade     | base      | light     | glint     | Min vs panel |
| --------- | --------- | --------- | --------- | --------- | --------- | ------------ |
| Ruby      | `#7e2a4d` | `#a93655` | `#e0455f` | `#eb8697` | `#f4bec7` | 2.2          |
| Ember     | `#8e4d3c` | `#bf683c` | `#ff8a3d` | `#ffb381` | `#ffd6bb` | 3.0          |
| Gold      | `#896c40` | `#b99542` | `#f6c945` | `#f9dc86` | `#fcecbe` | 4.0          |
| Moss      | `#3c674a` | `#4a8e51` | `#5cbf5a` | `#95d594` | `#c6e9c5` | 3.0          |
| Teal      | `#266a76` | `#2a9190` | `#2fc4b2` | `#78d9cd` | `#b6eae4` | 3.1          |
| Sapphire  | `#334991` | `#3d62b7` | `#4a82e8` | `#89aef0` | `#c0d3f7` | 2.3          |
| Amethyst  | `#5b378d` | `#7749b2` | `#9a5fe0` | `#bd97eb` | `#dcc7f4` | 2.2          |
| Rose      | `#87457d` | `#b65c9a` | `#f27ac0` | `#f7a9d6` | `#fad0e9` | 2.9          |
| Moonstone | `#736690` | `#998cb6` | `#c9bde6` | `#dcd4ef` | `#ece8f6` | 3.7          |
| Night     | `#3d335d` | `#4b426c` | `#5d5680` | `#9691ac` | `#c6c4d3` | 1.7          |

Measured on the table above with `tools/art/color.ts` (redmean distance): the closest two **base**
colours are 127 apart (Ember/Gold); consecutive shades within a family are 44-164 apart; the
largest hue drift from a base is 21°.

**Shades that cannot share a piece** (cross-family distance below 50; the checker rejects a piece
that uses both): Ruby glint / Rose light (47), Ember glint / Gold glint (45), Sapphire glint /
Moonstone light (48), Amethyst glint / Moonstone base (43), Amethyst glint / Moonstone light (27),
Moonstone shade / Night light (19), Moonstone base / Night glint (32). All other pairs of the 50
house shades are at least 50 apart. In practice: use glints sparingly, and a piece with both
Moonstone and Night leaves out Night's light and glint.

Custom ramps are allowed when a subject needs one (a particular skin, a specific stone), but they
must pass the same checks and are added to this table when they ship.

### Rules

- **A-10 [check] Families per piece: 3-8** (tutorial pieces, 24 per side or less, may use 2). More
  than eight and players stop being able to match by eye; fewer than three is hardly a picture.
  (Engine ceiling is 16 colours, section 7.)
- **A-11 [check] Shades per family: 1-5.** Four is the working number. A family used for the
  background or a flat object may have 1-2.
- **A-12 [check] Family separation:** the base colours of any two families in one piece are at
  least 90 apart (the rule M6.5 shipped, kept at base level only).
- **A-13 [check] Cross-family shade separation: ≥ 50.** Any shade of one family and any shade of
  another family _used in the same piece_ are at least 50 apart, so a light shade is never mistaken
  for a different family's base. The house pairs that fail are listed above.
- **A-14 [check] Visible steps:** consecutive shades in a ramp are 40-180 apart. Closer is
  invisible on a phone; farther reads as a different colour.
- **A-15 [check] Same hue:** a shade's hue is within 25° of its base (neutral Moonstone/Night
  exempt). Shading may shift toward warm in lights and toward violet in darks, never to a
  different colour.
- **A-16 [check] Readable on the board:** every shade has contrast ≥ 1.6 against the panel
  (`#0f0824`), the same floor `tools/art/check.ts` enforces today. **No pure or near black.** A
  black cat is Night deep/shade/base with a Moonstone glint, never `#000`.
- **A-17 [check, warning] Colour-blind pairs.** Matching must not rest on hue alone, and the
  game already has the answer: the M6.5 colour-blind symbols. This rule makes the exposure
  visible instead of forbidding it. The check simulates deuteranopia (Machado et al. 2009,
  severity 1.0, applied in linear RGB: the same matrix as `tools/familiar/familiar.test.ts`) and
  reports every pair of base colours in the piece that ends up less than 30 redmean apart **and**
  has a luminance contrast ratio below 1.4 (the ratio is measured on the original colours, not the simulated ones). Today that is two house pairs: **Teal/Rose** (15,
  ratio 1.16) and **Sapphire/Amethyst** (22, ratio 1.11). A piece may contain such a pair, but the
  review sheet flags it and the pair should not touch each other, so the symbols are the only thing
  telling them apart in a small area. Re-tuning those two ramps for value is a candidate change if
  playtesting (G3) shows trouble.
- **Light comes from the upper left.** Lights and glints sit on upper-left faces and edges, shades
  and deeps on lower-right. One light, everywhere in the picture. **A-18 [check]:** for each family
  with three or more shades and at least six light/glint cells and six shade/deep cells, the
  light/glint centroid's `x + y` is smaller than the shade/deep centroid's (so it is up, left or
  both; light from the upper right fails).
- **Glints are rare.** Glint cells are at most 4 % of a piece's cells **[check A-19]**, and each
  has a reason (a wet highlight, a flame core, a star point), not scattered to look sparkly.

## 4. Shape: silhouette, shading, outline, texture

1. **Silhouette first.** Fill the whole subject in base colours and hide everything else: can you
   still name it? If not, redraw the silhouette before adding detail. A crescent is a crescent,
   not "a yellow area". Hand-judged at G2; **A-20 [check]** keeps the shape stable at small size
   (definition in section 5a).
2. **Volume from ramps.** A round thing has a light side, a base, a shade side and a deep crease,
   in that order across the form. Flat unshaded areas of one shade are allowed only for small
   parts (a buckle, an eye), see A-31.
3. **Selective outline.** The silhouette edge, where a form meets empty board, gets a 1-cell edge
   in the family's **deep** (or shade) tone, never black and never a separate outline colour.
   Interior boundaries are drawn by a change of shade or family, not by a dark line. Not every edge
   needs the outline: light-side edges may stay light, which makes the form glow. **A-21 [check]**
   (definition in section 5a): at least 35 % of the piece's edge cells are deep or shade, and no
   more than 60 % are deep, so a piece with no shaded edge fails and so does a black-outlined one.
4. **Texture is shape.** Bark, stone, cloth, fur are shown with a few repeated structured marks that
   follow the form (stripes along a limb, facets on a crystal, folds along a cloak), not with
   random speckle. Texture may use at most one extra shade per family.
5. **One focal point.** One face, one flame, one gem. It gets the strongest contrast in the picture
   (the lightest light next to the deepest deep) and the cleanest cells.
6. **Keep the mood.** Dusky, warm-lit, slightly eerie: deep violet board, jewel colours, one warm
   light. Nothing grimdark, nothing that claims real religious or historical practice.

## 5. What counts as detail, and what is noise

A cell is **meaningful** when removing or recolouring it changes what a player would say about the
picture: it belongs to the silhouette, it models volume (a shade step), or it is a named feature
at phone size (an eye, a rune, a flame core, a buckle).

**Noise is any cell that exists to raise the count.** It makes the game longer without making the
picture better. The following are prohibited:

- **P-1** Plain rectangles as subjects or as "ground": a solid block, a flat band across the
  grid, a bar of ground under an object.
- **P-2** A giant flat background: a sky or wall filling the grid. A backdrop is allowed only as a
  _shaped vignette_ (an aura, an arch, a moon-glow disc) that is not a rectangle, uses at least
  two shades, and is at most 35 % of the filled cells.
- **P-3** Noise as detail: scattered single cells (`sprinkle`-style speckle, "stars" that are just
  random dots), dither or checkerboard patterns, random jitter of shades, single glints with no
  light logic.
- **P-4** Mirror-only complexity: a left half mirrored so the right half carries no new decision
  where the subject is not actually symmetric.
- **P-5** Pure black, and tones so close that a ramp step cannot be seen (A-14).
- **P-6** Text or letters. Runes are allowed only as shapes drawn to read at cube size, never
  as imitation of real scripts.
- **P-7** Borrowed material: any trace of Food Hunt art, a reference sprite, an image model's
  bitmap or a copied pixel layout. Everything is drawn here, and its source is recorded (section 6).

What the checker can see of these (exact definitions in section 5a):

- **A-30 [check] Orphans:** at most 1 % of filled cells.
- **A-31 [check] Flat areas:** the largest one-shade rectangle is at most 8 % of the grid, and no
  one shade is more than 45 % of the filled cells (P-1, P-2).
- **A-32 [check] Dither:** at most 2 % of filled cells, and a mean horizontal run of at least 2.0
  (P-3).
- **A-33 [check] Backdrop share:** a declared backdrop family is at most 35 % of filled cells and
  has at least two shades (P-2).
- **A-34 [check] Fragments:** same-family pieces smaller than 3 cells are at most 4 % of filled
  cells. Anything that must read at phone size (an eye, a rune, a gem) should be at least 2×2
  cells on grids of 24 or more; that part is hand-judged at G2.

### 5a. Definitions the checker uses

So two implementations cannot disagree. A cell is _filled_ if it is not empty. Neighbours are the
four orthogonal ones; outside the grid counts as empty. Percentages are of filled cells unless
stated.

- **Edge cell:** a filled cell with at least one empty neighbour. **A-21:** let _E_ be the edge
  cells; deep-or-shade cells in _E_ ≥ 35 % of _E_, and deep cells in _E_ ≤ 60 % of _E_.
- **A-20, silhouette stability:** cut the grid into 2×2 blocks from the top left (an odd edge
  block is padded with empty cells); a block is _filled_ if at least 2 of its cells are filled.
  Build the filled/empty mask of the blocks, scaled back to cells. The intersection-over-union of
  that mask with the original filled mask must be ≥ 0.75.
- **A-30 orphan:** a filled cell with no neighbour of its own family.
- **A-32 dither cell:** a filled cell whose four neighbours are all filled and all of a different
  family. (Empty and out-of-grid neighbours disqualify the cell, which is what separates it from an
  orphan.) The mean horizontal run is over maximal runs of consecutive identical _filled_ cells in a row; empty cells do not form runs.
- **A-31 rectangle:** the largest axis-aligned rectangle made only of one legend character.
- **A-34 fragment:** a 4-connected group of same-family cells of fewer than 3 cells.
- **A-13 / A-14** are evaluated on the shades a piece actually uses; "consecutive" means adjacent
  among the used roles in deep, shade, base, light, glint order.

## 6. How a piece is made and tracked

- **Hand-crafted, original.** Drawn cell by cell (or from a hand-painted PNG through
  `npm run art:import`); `content/art/draw.ts` shapes and `sprinkle` are **drafting aids** for
  blocking in a silhouette and may not be the finished picture. A piece that is only primitives
  (discs, polygons, scatter) fails review by definition.
- **Provenance per piece (M11.4 enforces):** `author`, `source` (`hand-drawn` | `imported-png` |
  `generated-draft`), `licence`, and `reviewed: true` set only by a human review of the contact
  sheet. `generated-draft` or unreviewed art cannot ship. The project has no licence file yet, so
  until the owner decides, a piece records "original, owner licence pending".
- **Lore.** One line per piece, no unsupported historical or religious claims.
- **Review artefacts:** every piece ships a full-size view and a contact sheet at real phone size
  (cube size from M11.2) with the checker output beside it.

## 7. Limits the art meets in the engine

`COLLECT_LIMITS`: grid up to 40×40, up to 16 gameplay colours (families), 6 columns. This bible
caps families at 8 for readability, so the engine ceiling is never the binding limit. Today a level
holds a palette of plain colours with no shade; carrying shades alongside families is the engine
and pipeline work in M11.2 and M11.4.

**What the later tasks inherit** (also recorded in the roadmap): M11.2 adds the per-cell shade to
the level model and renderer (family still decides gameplay) alongside the larger grids. M11.4 adds
`npm run art:check` implementing every rule marked **[check]** with the section 5a definitions,
reports A-17 as a warning, enforces the provenance fields of section 6, and **replaces** the single
distance-90 rule in `tools/art/check.ts`, which would otherwise reject every multi-shade ramp
(shade steps are 44-164). Until then v1 art keeps using `check.ts` unchanged.

## 8. Worked before / after

Both "after" pictures were scored with a throwaway script that implements the section 5a
definitions, and the scorecards below are its output. They prove the rules can be satisfied and
that the numbers are not contradictory. They do **not** prove the thresholds are right: A-20 and
A-31's 45 % shade cap were set after scoring these two pictures (see the calibration log), and M11.3's
real pieces will test them properly. A-17 (the colour-blind warning) concerns pairs of families and
is not triggered by either picture.

### Example 1: the candle (volume, ramps, silhouette)

**Before** (v1 `candleJar`, 10×12, 62 cells, 4 flat colours: orange flame, gold flame core, purple
jar, white wax; every part one tone, a rectangle for a body):

```
....ff....
...fyyf...
...fyyf...
....ff....
..pppppp..
..pwwwwp..
..pwwwwp..
..pwwwwp..
..pwwwwp..
..pwwwwp..
..pppppp..
.pppppppp.
```

**After** (illustrative, 16×20, 152 cells, 3 families, 13 shades; light from the upper left):

```
.......yy.......
......yYYO......
.....yYWWYO.....
.....yYWWYO.....
.....YYYYYO.....
......YYYO......
.......kk.......
....hmmmmmsd....
....hmmmmmsd....
....hmmsmmsd....
....hmmsmmsd....
....hmmmmmsd....
....hmmmmssd....
....hhmmmmsd....
....hmmmmmsd....
....hmmmmsdd....
.aaaaaaaaaaaaaa.
.AAAAAAAAAAAAvu.
..vvvvvvvvvvvu..
...uuuuuuuuuu...
```

| Key | Family / role           | Key | Family / role        |
| --- | ----------------------- | --- | -------------------- |
| `y` | Gold light              | `h` | Moonstone light      |
| `Y` | Gold base               | `m` | Moonstone base       |
| `W` | Gold glint (flame core) | `s` | Moonstone shade      |
| `O` | Gold shade              | `d` | Moonstone deep       |
| `k` | Gold deep (wick)        | `a` | Amethyst light (lip) |
| `A` | Amethyst base           | `v` | Amethyst shade       |
| `u` | Amethyst deep           |     |                      |

What changed: a flame with a core, a wax column lit from the left with a shaded right edge and a
drip, and a dish with a lit lip and a deep underside, instead of one tone per part. No sky, no
ground bar, no scattered dots.

Scorecard (every rule passes):

| Rule | Measured                                                                 | Result |
| ---- | ------------------------------------------------------------------------ | ------ |
| A-01 | 16×20, 152 cells                                                         | pass   |
| A-02 | spans 100 %                                                              | pass   |
| A-03 | 4/4 corners empty, 53 % empty                                            | pass   |
| A-10 | 3 families                                                               | pass   |
| A-11 | Gold 5, Moonstone 4, Amethyst 4                                          | pass   |
| A-12 | closest bases 203                                                        | pass   |
| A-13 | closest cross-family shades 79                                           | pass   |
| A-14 | steps 58-146                                                             | pass   |
| A-15 | max hue drift 9°                                                         | pass   |
| A-16 | lowest contrast 2.20                                                     | pass   |
| A-18 | light < shade in all three families (x+y 8.6/12.9, 15.3/21.1, 23.5/26.3) | pass   |
| A-19 | glint 2.6 % (4 cells)                                                    | pass   |
| A-20 | IoU 0.88                                                                 | pass   |
| A-21 | 56 edge cells: 54 % deep/shade, 41 % deep                                | pass   |
| A-30 | orphans 0 %                                                              | pass   |
| A-31 | largest flat rectangle 15 cells = 4.7 %; top shade 26 %                  | pass   |
| A-32 | dither 0 %, mean run 2.30                                                | pass   |
| A-33 | no backdrop                                                              | pass   |
| A-34 | fragments 0 %                                                            | pass   |

### Example 2: the crescent (silhouette and backdrop)

**Before** (v1 `crescent`, 12×12, 144 cells, **100 of them flat night sky**; 40 gold cells, 4
starlight dots): a full-rectangle sky, a crescent of one tone, stars as scattered single cells.
This breaks P-2 (giant flat background), P-3 (random dots) and A-31.

**After** (illustrative, 24×24, 219 cells, 3 families, 10 shades; no sky: the only backdrop is a
thin Amethyst halo arc on the lit side, 24 % of the cells):

```
........................
.......a................
.....aaA............s...
....aaAA..LLLSK....sms..
...aAA.WLLLSSK......s...
..aaA.WLYYSK............
..aA.LLYYYS.............
.aAALLYYYSK.............
.aA.LYYYYS..............
.aALLYYYYS..............
.AALYYYYYS..............
.A.LYYYYYS..............
.A.LYYYYYS..............
.v.LYYYYYYS.............
.vvLYYYYYYS.............
.vvSYYYYYYYS............
.vv.LYYYYYYYS...........
.vvvSYYYYYYYYLLS..LS....
..vv.SYYYYYYYYYYLLSK.s..
..vvv.SYYYYYYYYYSSK.sms.
...vvv.SSSYYYYSSK....s..
....vvvv..SSSSK.........
.....vvv................
.......v................
```

`W` Gold glint, `L` Gold light, `Y` Gold base, `S` Gold shade, `K` Gold deep; `a` Amethyst light,
`A` Amethyst base, `v` Amethyst shade; `m` Moonstone base, `s` Moonstone shade (the star arms).

The moon is the silhouette, with a lit outer limb, a shaded inner curve and a deep tip; the halo
frames the lit side only; the two stars are plus shapes with a lit centre that balance the open
side, not scattered dots; all four corners are empty.

Scorecard (every rule passes):

| Rule | Measured                                                  | Result |
| ---- | --------------------------------------------------------- | ------ |
| A-01 | 24×24, 219 cells                                          | pass   |
| A-02 | spans 96 %                                                | pass   |
| A-03 | 4/4 corners empty, 62 % empty                             | pass   |
| A-10 | 3 families                                                | pass   |
| A-11 | Gold 5, Amethyst 3, Moonstone 2                           | pass   |
| A-12 | closest bases 203                                         | pass   |
| A-13 | closest cross-family shades 79                            | pass   |
| A-14 | steps 86-146                                              | pass   |
| A-15 | max hue drift 9°                                          | pass   |
| A-16 | lowest contrast 3.13                                      | pass   |
| A-18 | light < shade in Gold (17.0/25.5) and Amethyst (7.9/21.9) | pass   |
| A-19 | glint 0.9 % (2 cells)                                     | pass   |
| A-20 | IoU 0.79                                                  | pass   |
| A-21 | 106 edge cells: 60 % deep/shade, 8 % deep                 | pass   |
| A-30 | orphans 0 %                                               | pass   |
| A-31 | largest flat rectangle 40 cells = 6.9 %; top shade 40 %   | pass   |
| A-32 | dither 0 %, mean run 2.03                                 | pass   |
| A-33 | Amethyst halo 24 % of filled, 3 shades                    | pass   |
| A-34 | fragments 0 %                                             | pass   |

## 9. Review checklist (what G2 asks)

1. Name each piece from its silhouette alone.
2. Does every ramp read as one family, and every family differ from its neighbours?
3. Is the light consistent?
4. Is every cell doing work (no noise, no flat rectangles)?
5. Does it read in the phone-size contact sheet, not only at 10×?
6. Is the lore line safe and original?

## Calibration log

| Date       | Rule | Initial               | Now              | Why                                                                                         |
| ---------- | ---- | --------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| 2026-10-23 | all  | (set)                 | -                | First version; revised only by M11.2 measurements and M11.3 pieces.                         |
| 2026-10-23 | A-20 | IoU 0.80              | 0.75             | The first crescent scored 0.79; a thin halo and tips lose cells at half size.               |
| 2026-10-23 | A-31 | top shade 35 %        | 45 %             | A mostly-gold subject has a natural base share; the backdrop cap (A-33) stays 35 %.         |
| 2026-10-23 | A-13 | stated for all shades | used shades only | Seven house glint/light pairs fail 50; listed in section 3.                                 |
| 2026-10-23 | A-17 | hard fail at 60       | warning          | Two house pairs collapse under deuteranopia; the M6.5 symbols are the answer (as in M10.1). |
