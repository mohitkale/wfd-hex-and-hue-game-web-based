# The v2 art pipeline (M11.4)

How a picture gets from a painter's PNG (or hand-typed rows) to something the game can ship, and
what stops bad art. The rules themselves are [ART_DIRECTION_V2.md](ART_DIRECTION_V2.md); this page is
the tooling.

## Status

The representative set of M11.3 (six pieces) is in `content/v2art` awaiting the owner's review at
gate G2 (see [V2_ART_SET.md](V2_ART_SET.md)); none is reviewed or shipped.

## The pieces

| What              | Where                         | Notes                                                                       |
| ----------------- | ----------------------------- | --------------------------------------------------------------------------- |
| Piece model       | `tools/art/piece.ts`          | Rows + a legend of (family, shade role) + provenance                        |
| House families    | `tools/art/families.ts`       | 10 ramps (deep, shade, base, light, glint); a test pins them to the doc     |
| Rules             | `tools/art/rules.ts`          | A-01..A-35 (21 checks, one warning) and the provenance rules                |
| Library check     | `tools/art/artcheck.ts`       | `npm run art:check` (part of `npm run verify`)                              |
| Review sheet      | `tools/art/sheet.ts`          | `npm run art:sheet` → `dist/art-sheet.html`; `renderPng` for committed PNGs |
| Production import | `tools/art/importFamilies.ts` | `npm run art:import -- art.png id --families --author "Name"`               |
| Library           | `content/v2art/index.ts`      | `pieces` (everything) and `SHIPPED` (what worlds use)                       |
| Game data         | `pieceToArt(piece)`           | gameplay `Art` (one colour per family) + the `shades` layer (M11.2)         |

The v1 pipeline (`tools/art/check.ts`'s single colour-distance rule, `art:preview`) is untouched:
v1 levels still use it. v2 art uses the families-and-ramps rules instead; `check.ts` only supplies
the board panel colour to them.

## Labelling the source

`hand-drawn` means a person (or the author) placed the picture cell by cell; drafting aids may block
in a shape, but the finished piece must not be only what they produced. A piece whose silhouette and
base shading came from geometric helpers with a few details added by hand is a borderline case:
label it `hand-drawn` only if the owner accepts that workflow, and say what was generated in
`provenance.notes` (the M11.3 set does this and asks the owner at G2). When in doubt use
`generated-draft`, which can be neither reviewed nor shipped until it is finished by hand.

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
- **Review:** `reviewed: true` needs a named reviewer, a real date and a `reviewedHash` equal to
  `contentHash(piece)`, so **changing the picture after approval fails the check until a human
  reviews it again** (the failure prints the new hash). CI, solvers, simulated players and the model
  are never reviewers: the check rejects those names, but see the limits below. A `generated-draft`
  can be neither reviewed nor shipped: generated shapes are sketches.
- **Placeholders:** an author or lore that is `unknown`, `TODO`, `imported` and the like fails.
- **Shipping:** every id in `SHIPPED` must exist, be reviewed, and not be a generated draft.

**Warnings** (listed, not failing): A-17 (a pair of families that collapse under deuteranopia and
cannot be told apart by value; the colour-blind symbols cover it), and a shipped piece whose licence
is still `original-owner-pending`. The second is a reminder for the release gate (G4): the repository
has no licence file yet and the choice is the owner's.

## Limits, stated plainly

- `reviewed`, `reviewedBy`, `reviewedOn` and `reviewedHash` are plain data in the repository. The name
  filter is a **tripwire**, not proof of a human: anyone who commits can type a plausible name. The
  real protection is the human gates (G2, G4) and a person reading the pull request that sets those
  fields. Per the project rules, only the owner's approval in chat leads to `reviewed: true`.
- `SHIPPED` is a hand-edited list in `content/v2art/index.ts`; nothing yet links a world to it (worlds
  arrive in M13.1, which must derive or test that every piece a world uses is listed).
- Until the owner chooses a licence, a shipped piece with `original-owner-pending` is only a
  warning. `npm run art:check -- --release` makes it an error: run it at the release gate (G4).
- `features` (deliberate one-cell details) is bounded by A-35, but choosing what is a feature is a
  judgement the reviewer sees on the sheet.
- `import --families` prints a rule report for a draft and never sets the exit code.

## Not checked

Whether a picture is recognisable and good. A-20 only checks that its silhouette survives a
half-size round trip. Recognisability is judged by a person on the sheet at phone size (the G2
review, ART_DIRECTION_V2 §9), and `reviewed: true` is only ever set after that.
