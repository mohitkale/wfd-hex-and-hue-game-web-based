# Completion reveal and the v2 Spellbook (M11.5)

What happens when you win a v2 level whose picture is known, and where the picture goes.

## Try it

```bash
npm run dev
```

Open `/play/?engine=v2&level=art-black-cat` (or `art-crescent-moon`, `art-triple-moon`,
`art-witchs-cauldron`, `art-amethyst-cluster`, `art-libra-scales`; add `&speed=2` to hurry). These
are **preview levels**: each art piece's groups are dealt by a seeded search until a simple bot can
win (`npm run art:levels`), nothing more. Real level design, solving and difficulty are M12.
`/play/?engine=v2&view=spellbook` opens the Spellbook directly.

## What a win does

1. The finished illustration is **revealed** over the dimmed board by the picture's theme:

   | Theme     | Effect               | Reveal                   | Particles         |
   | --------- | -------------------- | ------------------------ | ----------------- |
   | moon      | The moon is lit      | sweeps from the top left | slow twinkles     |
   | ritual    | The brew bubbles up  | rises from the bottom    | bubbles rising    |
   | crystal   | The crystals glow    | grows from the centre    | a burst of glints |
   | astrology | The sign is revealed | scattered, star by star  | gold twinkles     |
   | familiar  | It opens its eyes    | top to bottom            | green sparks      |
   | other     | The picture blooms   | from the centre          | a soft burst      |

2. The name, the lore line and the Spellbook line appear: "Added to your Spellbook" the first time,
   "Already in your Spellbook" after, "Could not be saved on this device" if storage failed.
3. **Spellbook** opens the v2 Spellbook (since M13.2 a scrollable gallery grouped by world, see docs/V2_GALLERY.md; every art piece: finished with its name once
   collected, a silhouette until then; tap a collected card for its page with the lore and how many
   times you have completed it). **Play again** restarts the level.

[reveal-cauldron.jpg](art/m11.5/reveal-cauldron.jpg) and [spellbook.jpg](art/m11.5/spellbook.jpg)
are screenshots from the browser pane at 390×800 (the Spellbook one is caught mid fade-in).

## The world's moment (M13.3)

On top of the picture's own effect (chosen by its theme) the win card carries its **world's** mark,
from `worldMoment.ts` and `worldIdentity.ts`:

| World              | Seal     | Seal colour | Card tint (backdrop) |
| ------------------ | -------- | ----------- | -------------------- |
| Moonlit Beginnings | crescent | gold        | the world's night    |
| Crystal Garden     | crystal  | teal        | deep teal            |
| Zodiac Realm       | star     | blue        | deep indigo          |

- A **world line** under the lore, led by the seal: "First page of Moonlit Beginnings" for the first
  page you collect there, "Moonlit Beginnings · 2 of 3 pages" for progress (also on a replay), and
  "Moonlit Beginnings: every page so far" when the win collects the last page the library has for that
  world. It never says a world is finished: most pages do not exist yet (docs/V2_WORLDS.md). If the
  win could not be saved, no progress is claimed and there is no world line.
- The end card's shade takes the world's backdrop colour.
- When the reveal finishes by itself, the seal's colour opens once as a **ring** around the picture
  (0.9 s). **A skip tap, reduced motion, or a redraw of a reveal already seen shows no ring**: the
  line, seal and tint are static and appear with the text.
- Nothing waits on it, nothing is gated by it, and it changes no outcome.

Tested: the line wording for first/progress/every-page/replay/single-page worlds, unknown pieces,
distinct seals, seal outlines inside their radius, and the ring (rises, fades, ends, never plays when
reduced or skipped). Checked in the browser pane: the crescent seal and "First page of Moonlit
Beginnings" after winning the crescent level, and the star seal with "Zodiac Realm · 1 of 1 page"
after Libra. **Not checked:** the crystal seal on screen, the ring in motion by eye (it was driven
through a background tab), reduced motion in the running game, a real phone.

## Rules it keeps

- **Skippable:** a tap anywhere during the reveal jumps to the finished picture. It is presentation
  after the game is won; nothing waits on it, and nothing in it touches the game state.
- **Reduced motion:** the picture is shown complete at once and there are no particles.
- **Never blocks play:** a failed save (private mode, full storage) only changes one line of text.
  The Spellbook is kept in its own key (`hexhue.v2.spellbook`), apart from the shipped game's save,
  which the review build does not touch.
- **A win is recorded once** even if the window is resized while the card is up.
- **A loss unlocks nothing:** only a won state shows the reveal.

## Where it lives

`packages/game/src/collect/`: `completion.ts` (effect per theme, reveal order and schedule, particle
seeds: pure and tested), `v2Spellbook.ts` (the book and its storage wrapper: pure and tested),
`CompletionOverlay.ts` (the win screen), `CollectSpellbookScene.ts`, `pictureView.ts`,
`artLevels.ts` / `artLevelCodec.ts` and `generated/art-levels.json` (the preview levels, compact so
the v2 chunk stays at 26 of 40 KB). Core gained an optional display-only `subject` on a level
(id, name, theme, lore).

## Verified, and not

Verified in the browser pane (a bot played the preview levels at `&speed=2`): `art-witchs-cauldron`
(390×800) and `art-triple-moon` (375×667, a short phone). The reveal and end card appeared with the
lore; **Spellbook** showed the grid with the cards fitted above the button; **Back to the board**
returned to a live board (a review found that, before a fix, the board stayed dead after this path,
because Phaser reuses the scene instance and its leftover overlay swallowed every tap); a second win
was recorded as win 2, not a new unlock; resizing the window while the card was up did not replay
the reveal or count the win twice.

Covered by unit tests: effect choice per theme, the reveal schedule, reduced motion and skip giving
the finished picture, Spellbook unlock on a win (and not otherwise), corrupt, unreadable and
unavailable storage (an unreadable book is never overwritten), and the preview levels being valid,
**bot-winnable** (not solver-verified: that is M12.1), and current.

**Not exercised by a person or in the browser:** the skip tap itself and the reduced-motion path in
the running game (their logic is tested, the wiring is not clicked through), the other four reveals,
and anything on a real phone. The Phaser scene lifecycle (the restart cycle above) has no automated
test, only the browser check. The reveals are a first pass at the effect designs, not tuned.
The Spellbook became a world-grouped gallery with replay in M13.2 (docs/V2_GALLERY.md); world-specific completion moments followed in M13.3 (below).
