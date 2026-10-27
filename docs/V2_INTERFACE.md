# The v2 play screen (M14.1)

Portrait-first, uncluttered, with big readable numbers. This is what changed and what is measured; the
screen's geometry is the pure `computeCollectLayout` (`collectLayout.ts`), tested for every device in
the matrix of docs/QA.md.

## What changed

- **A progress bar** along the bottom edge of the HUD (`progress.ts`, `CollectHud.ts`): delivered over
  total, a gold fill on a faint track, no extra words. It sits flush with the HUD's bottom edge, below
  the button circles even on the smallest phone. The fill is never full until the last cube is
  delivered (also on a 1,600-cube board, where one cube is under a pixel) and shows a sliver as soon as
  one is.
- **Three parts, top to bottom (M15.9): the PUZZLE, the TRAYS, the COLOURED BOXES.** Every group box (in a
  column or in a tray) is the same rounded square (`layout.tile`, at most 48 css px) with a big centred
  number and no creature on it. There is **one row of trays** (`fieldCap + slots` of them: five for most
  levels; the Extra Slot booster adds one; they are always drawn bordered). A tapped box moves into a
  tray and **stays there**: while it works the tray is open (a lid tips back over a dark opening, the
  box glows, a bar shows how much it has delivered, and the familiars come out of it, fetch their cubes
  and carry them back into it while the number counts down); if it has nothing it can reach it
  **waits in the same tray**, closed and dimmed with "zz" (tap the tray to resume it); at zero the tray
  closes, then the box goes (the closing was written from the code and tests, not yet seen by eye: the
  browser pane throttles animation frames). The coloured boxes are a grid with the **same spacing across
  and down** (`gap`): each column shows its next three boxes (front at the top), the rest stay hidden,
  and when a column runs out the others centre as a group. Nothing is drawn around the picture (the ring
  is only the walkway).
- **`CollectScene` is split** (it was 847 lines, now about 670): `CollectHud` (title, buttons, progress),
  `Toast` (the one-line message, now wrapping to the board width), `EndCard` (plain win and
  loss card) and the pure `badgeBox.ts` (where each badge sits and how big its number is) and
  `endCardText.ts`. No behaviour moved except the above, and that the end card's one-line reason now
  wraps to 86% of the frame width, so it fits a 320 px phone.
- Nothing else was added: no new panels, labels or counters. The screen is still the HUD, the board,
  the field strip, the holding slots and the summon columns.

## The device matrix

24×24 board, five slots, four columns (the typical level), sizes in CSS px
(`npm run layout:matrix`; since M14.4 it includes the 30 CSS px booster tray under the HUD, which costs the shortest phones up to 0.5 CSS px per cube):

| Device              | Viewport @ dpr | Cube | Column     | Tray | Column number | Tray number |
| ------------------- | -------------- | ---- | ---------- | ---- | ------------- | ----------- |
| iPhone SE (1st gen) | 320×568 @2     | 11.5 | 39×130     | 39   | 17.5          | 17.5        |
| iPhone SE (2nd gen) | 375×667 @2     | 13.5 | 45.5×151.5 | 45.5 | 20.5          | 20.5        |
| iPhone 15           | 393×852 @3     | 14.7 | 48×160     | 48   | 21.7          | 21.7        |
| Pixel 7             | 412×915 @2.625 | 15.2 | 48×160     | 48   | 21.3          | 21.3        |
| Galaxy S8           | 360×740 @3     | 13.3 | 48×160     | 48   | 21.7          | 21.7        |
| iPad                | 768×1024 @2    | 18   | 48×160     | 48   | 21.5          | 21.5        |
| iPad (landscape)    | 1024×768 @2    | 17   | 48×160     | 48   | 21.5          | 21.5        |
| Desktop             | 1440×900 @1    | 18   | 48×160     | 48   | 22            | 22          |
| Phone (landscape)   | 844×390 @3     | 7    | 29.7×99    | 29.7 | 13.3          | 13.3        |

## What the tests guarantee (`interface.test.ts`)

For every device above and for boards of 10, 24 and 40 cubes a side with 3 to 8 slots and 3 to 6
columns:

- Nothing leaves the frame; the board overlaps no other part of the screen; the panels stack in order
  (HUD, board, field, slots, columns) and no two tiles overlap; the notch and home bar are respected.
- Portrait devices: every summon column is at least 44 css px wide and 90 tall; five slots are at least
  44 css px (eight are narrower but at least 30); the HUD buttons are 44 css px apart.
- Numbers: front group at least 18 css px (14 with six columns), slot and field numbers at least 14 (10
  for eight slots), peeks at least 9 (8 with six columns on a 320 px phone, the tightest case).
- Cubes are not specks: at least 20 css px on a 10×10 board, 11 on 24×24 and 7 on 40×40.
- Landscape phones still lay out, with a board you can see (the game is portrait-first and shows an
  "upright" hint there).
- Text contrast on the play screen's backgrounds is at least 4.5:1 (WCAG AA) for body, dim and gold text
  and the toast. White group numbers on every badge colour in the shipped levels are at least 3.5:1
  (AA for large text, which the front and field numbers are): the lightest badges (gold, cyan, green)
  sit near 3.7:1, below 4.5:1, so the smaller slot numbers rely on their dark outline.
- Every shipped level (the slice and the six art pieces) on every framed device: nothing overlaps the
  board, cubes at least 7 css px, columns at least 44 css px, front numbers at least 14.
- Every group box is the same square; a three-digit number fits the tile; the three boxes of a column stays inside its column; columns hold three boxes, centred as a group.
- The HUD buttons are 36 css px circles in 44 css px tap targets (shared constants), 44 apart.
- The device table here equals what `npm run layout:matrix` prints (`tools/collect/layoutMatrix.test.ts`).
- The progress numbers: never 100% early, survive no cubes, negative or too many delivered, and the bar
  sits inside the HUD on every device.

## Verified, and not

Checked in the browser pane at 375×812: the progress bar filling as cubes are delivered, the larger
field numbers, a loss card with Retry and Undo (Retry restarts cleanly) and the toast wrapping.

**Not done, so the "accessibility checks" criterion is only partly met:** the real-hardware pass of
docs/QA.md (one iPhone, one mid-range Android: touch feel, frame rate); a screen-reader path for the
canvas beyond what the page already has; an audit of every dialog on a 320×480 screen (the win cards were
checked in M13); and group numbers on the lightest badge colours are 3.7:1, not 4.5:1. The progress bar
is purely visual (it has no text alternative).
