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
- A piece fills its grid: the subject's bounding box spans at least 85 % of the grid in its larger
  dimension, so no tiny picture swims in a big frame **[check A-02]**.
- At least 3 of the 4 corner cells are empty (the silhouette rule), and at least 10 % of all cells
  are empty **[check A-03]**.
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

Measured on the table above (redmean distance, the metric `tools/art/color.ts` already uses): the
closest two **base** colours are 127 apart (Ember/Gold); consecutive shades within a family are
46-169 apart; the largest hue drift from a base is 21°. Cross-family distance between any two
shades from the safe subset (deep, shade, base, light; Night without light) is at least 53. Glints
are weaker (Ember/Gold glints are 45 apart) and are used sparingly (below).

Custom ramps are allowed when a subject needs one (a particular skin, a specific stone), but they
must pass the same checks and are added to this table when they ship.

### Rules

- **A-10 [check] Families per piece: 3-8.** More than eight and players stop being able to match
  by eye; fewer than three is not a picture. (Engine ceiling is 16 colours, section 7.)
- **A-11 [check] Shades per family: 1-5.** Four is the working number. A family used for the
  background or a flat object may have 1-2.
- **A-12 [check] Family separation:** the base colours of any two families in one piece are at
  least 90 apart (the rule M6.5 shipped, kept at base level only).
- **A-13 [check] Cross-family shade separation: ≥ 50.** Any shade of one family and any shade of
  another family used in the same piece are at least 50 apart, so a light shade is never mistaken
  for a different family's base. (Night's light shade and Moonstone's shade collide on purpose
  here: a piece using both leaves one of them out.)
- **A-14 [check] Visible steps:** consecutive shades in a ramp are 40-180 apart. Closer is
  invisible on a phone; farther reads as a different colour.
- **A-15 [check] Same hue:** a shade's hue is within 25° of its base (neutral Moonstone/Night
  exempt). Shading may shift toward warm in lights and toward violet in darks, never to a
  different colour.
- **A-16 [check] Readable on the board:** every shade has contrast ≥ 1.6 against the panel
  (`#0f0824`), the same floor `tools/art/check.ts` enforces today. **No pure or near black.** A
  black cat is Night deep/shade/base with a Moonstone glint, never `#000`.
- **A-17 [check] Colour-blind safety is not hue alone.** Families must stay at least 60 apart
  (redmean) under simulated deuteranopia; a pair below that is allowed only if the pieces tell them
  apart in value (their bases differ by contrast ratio ≥ 1.4). The M6.5 symbols cover the rest.
  (M10.1 measured the familiar sheet's eight colours at about 66 at their closest pair under deuteranopia.)
- **Light comes from the upper left.** Lights and glints sit on upper-left faces and edges, shades
  and deeps on lower-right. One light, everywhere in the picture. **A-18 [check, heuristic]:**
  within a family of three or more shades, the light/glint cells' mean row is above (smaller than)
  the shade/deep cells'.
- **Glints are rare.** Glint cells are at most 4 % of a piece's cells **[check A-19]**, and each
  has a reason (a wet highlight, a flame core, a star point), not scattered to look sparkly.

## 4. Shape: silhouette, shading, outline, texture

1. **Silhouette first.** Fill the whole subject in base colours and hide everything else: can you
   still name it? If not, redraw the silhouette before adding detail. A crescent is a crescent,
   not "a yellow area". Hand-judged at G2; **A-20 [check]** keeps the shape stable at small size:
   downsampled to half size (majority family per 2×2 block) and back, at least 80 % of the filled
   cells stay in the same place.
2. **Volume from ramps.** A round thing has a light side, a base, a shade side and a deep crease,
   in that order across the form. Flat unshaded areas of one shade are allowed only for small
   parts (a buckle, an eye), see A-31.
3. **Selective outline.** The silhouette edge, where a form meets empty board, gets a 1-cell edge
   in the family's **deep** (or shade) tone, never black and never a separate outline colour.
   Interior boundaries are drawn by a change of shade or family, not by a dark line. Not every edge
   needs the outline: light-side edges may stay light, which makes the form glow. **A-21 [check]**:
   outline cells are deep or shade of their family, and at most 60 % of edge cells use deep.
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

What the checker can see of these:

- **A-30 [check] Orphans:** cells with no 4-neighbour of the same family are at most 1 % of filled
  cells (intentional one-cell features, such as an eye glint, are marked in the source).
- **A-31 [check] Flat areas:** the largest axis-aligned rectangle of one shade is at most 8 % of
  the grid area, and no one shade exceeds 35 % of filled cells (P-1, P-2).
- **A-32 [check] Dither:** cells whose four neighbours all differ in family from them are at most
  2 % of filled cells; the mean horizontal run of one shade is at least 2.0 (P-3).
- **A-33 [check] Backdrop share:** if a piece has a backdrop family, it is at most 35 % of filled
  cells and has at least two shades (P-2).

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

## 8. Worked before / after

### Example 1: the candle (volume, ramps, silhouette)

**Before** (v1 `candleJar`, 10×12, 62 cells, 4 flat colours: orange flame, gold flame core, purple jar,
white wax; every part one tone, a rectangle for a body):

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

**After** (illustrative, 14×16, 108 cells, 3 families, 12 shades; light from the upper left):

```
......yy......
.....yYYy.....
....yYWWYy....
....yYWWYY....
....YYYYYO....
.....YYYO.....
......kk......
....hmmmss....
....hmmmss....
...hmmmmmss...
...hmmmmmss...
...hmmmmmss...
...hmmmmmss...
.aaaaaaaaaaaa.
.AAAAAAAAAAvv.
..vvvvvvvvuu..
```

| Key | Family / role           | Key | Family / role        |
| --- | ----------------------- | --- | -------------------- |
| `y` | Gold light              | `m` | Moonstone base       |
| `Y` | Gold base               | `h` | Moonstone light      |
| `W` | Gold glint (flame core) | `s` | Moonstone shade      |
| `O` | Gold shade              | `a` | Amethyst light (lip) |
| `k` | Gold deep (wick)        | `A` | Amethyst base        |
| `v` | Amethyst shade          | `u` | Amethyst deep        |

What changed and why it passes: a **flame with a core** (the four glint cells are 3.7 % of the 108,
under A-19's 4 % cap); a **wax column lit from the left** (light edge, base, shade edge) instead of
a flat white block; a **dish** with a lit lip and a shaded underside instead of a pot rectangle; no
sky, no ground bar, no scattered dots.

### Example 2: the crescent (silhouette and backdrop)

**Before** (v1 `crescent`, 12×12, 144 cells, **100 of them flat night sky**; 40 gold cells, 4
starlight dots): a full-rectangle sky, a crescent of one tone, stars as scattered single cells.
This breaks P-2 (giant flat background), P-3 (random dots) and A-31.

**After** (illustrative, 16×16, 99 cells, 2 families, 4 shades, no backdrop):

```
................
.............m..
.....LLLL...mmm.
...LLLYYYS...m..
..LLYYYS........
..LYYYS.........
.LLYYYS.........
.LYYYYS.........
.LYYYYS.........
.LYYYYS.........
.LYYYYYS.....m..
..LYYYYYSS..mmm.
..LLYYYYYYSS.m..
...LLYYYYYYYS...
....SSSSSSSS....
................
```

`L` Gold light, `Y` Gold base, `S` Gold shade, `m` Moonstone base. The crescent is the silhouette
with a lit outer limb (upper left) and a shaded inner curve; the two stars are three-by-three
plus shapes with a purpose (they balance the open side of the crescent), not random dots; the
four corners are empty. The first draft of this example was generated from two discs and shaded
automatically; it had a stray light cell on the bottom edge and a star overlapping the crescent's
tip. It was corrected by hand, which is the point of section 6: a generated shape is the
sketch, never the picture.

## 9. Review checklist (what G2 asks)

1. Name each piece from its silhouette alone.
2. Does every ramp read as one family, and every family differ from its neighbours?
3. Is the light consistent?
4. Is every cell doing work (no noise, no flat rectangles)?
5. Does it read in the phone-size contact sheet, not only at 10×?
6. Is the lore line safe and original?

## Calibration log

| Date       | Rule | Initial | Now | Why                                                                 |
| ---------- | ---- | ------- | --- | ------------------------------------------------------------------- |
| 2026-10-23 | all  | (set)   | -   | First version; revised only by M11.2 measurements and M11.3 pieces. |
