# The v2 art pipeline (M11.4)

How a picture gets from a painter's PNG (or hand-typed rows) to something the game can ship, and
what stops bad art. The rules themselves are [ART_DIRECTION_V2.md](ART_DIRECTION_V2.md); this page is
the tooling.

## The pieces

| What              | Where                         | Notes                                                                       |
| ----------------- | ----------------------------- | --------------------------------------------------------------------------- |
| Piece model       | `tools/art/piece.ts`          | Rows + a legend of (family, shade role) + provenance                        |
| House families    | `tools/art/families.ts`       | 10 ramps (deep, shade, base, light, glint); a test pins them to the doc     |
| Rules             | `tools/art/rules.ts`          | A-01..A-34 (20 checks, one warning) and the provenance rules                |
| Library check     | `tools/art/artcheck.ts`       | `npm run art:check` (part of `npm run verify`)                              |
| Review sheet      | `tools/art/sheet.ts`          | `npm run art:sheet` → `dist/art-sheet.html`; `renderPng` for committed PNGs |
| Production import | `tools/art/importFamilies.ts` | `npm run art:import -- art.png id --families --author "Name"`               |
| Library           | `content/v2art/index.ts`      | `pieces` (everything) and `SHIPPED` (what worlds use)                       |
| Game data         | `pieceToArt(piece)`           | gameplay `Art` (one colour per family) + the `shades` layer (M11.2)         |

The v1 pipeline (`tools/art/check.ts`'s single colour-distance rule, `art:preview`) is untouched:
v1 levels still use it. v2 art uses the families-and-ramps rules instead; `check.ts` only supplies
the board panel colour to them.

## Authoring

1. Draw the picture as rows of characters, or paint a PNG (one pixel per cube, or upscaled; the
   block size is detected) using the house ramps.
2. `npm run art:import -- art.png candle --families --author "Name"` snaps every colour to its
   nearest house shade and prints a piece plus the rule report. It refuses an image whose colours
   are, on average, farther than 45 (redmean) from the house palette (repaint, or define custom
   ramps), refuses photographs (over 256 colours), and folds the least-used families into the
   nearest kept ones when `--max-families` is lower than what the picture uses.
3. Fill in `name`, `theme` and `lore` (a leftover `TODO` lore fails the check), add the piece to
   `content/v2art/index.ts`, run `npm run art:check` and `npm run art:sheet`, and look at the sheet:
   the rules cannot tell you whether it is a good picture.

## What fails the build

`npm run art:check` exits non-zero when any piece in the library has an **error**:

- **Quality:** any of A-01..A-16, A-18..A-21, A-30..A-34 (each reports what it measured), or a
  picture that cannot be read at all (`STRUCT`).
- **Provenance:** no author; a source other than `hand-drawn`, `imported-png` or `generated-draft`;
  a licence outside the closed list; a lore line that is empty, over 140 characters or a `TODO`; a
  malformed id.
- **Review:** `reviewed: true` needs a named reviewer and a date, and **CI, a solver, a simulated
  player or the model itself is never a reviewer** (the check rejects those names). A
  `generated-draft` can be neither reviewed nor shipped: generated shapes are sketches.
- **Shipping:** every id in `SHIPPED` must exist, be reviewed, and not be a generated draft.

**Warnings** (listed, not failing): A-17 (a pair of families that collapse under deuteranopia and
cannot be told apart by value; the colour-blind symbols cover it), and a shipped piece whose licence
is still `original-owner-pending`. The second is a reminder for the release gate (G4): the repository
has no licence file yet and the choice is the owner's.

## Not checked

Whether a picture is recognisable and good. A-20 only checks that its silhouette survives a
half-size round trip. Recognisability is judged by a person on the sheet at phone size (the G2
review, ART_DIRECTION_V2 §9), and `reviewed: true` is only ever set after that.
