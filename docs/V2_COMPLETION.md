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
3. **Spellbook** opens the v2 Spellbook (a grid of every art piece: finished with its name once
   collected, a silhouette until then; tap a collected card for its page with the lore and how many
   times you have completed it). **Play again** restarts the level.

[reveal-cauldron.jpg](art/m11.5/reveal-cauldron.jpg) and [spellbook.jpg](art/m11.5/spellbook.jpg)
are screenshots from the browser pane at 390×800 (the Spellbook one is caught mid fade-in).

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

Verified in the browser pane: a bot played `art-witchs-cauldron` to a win; the reveal and end card
appeared with the lore and "Added to your Spellbook"; the Spellbook showed 1 of 6 collected and its
page. Covered by unit tests: effect choice per theme, the reveal schedule, reduced motion and skip
giving the finished picture, Spellbook unlock on a win (and not otherwise), corrupt and unavailable
storage, the preview levels being valid, winnable and current.

**Not exercised by a person or in the browser:** the skip tap itself and the reduced-motion path in
the running game (their logic is tested, the wiring is not clicked through), the other five reveals,
and anything on a real phone. The reveals are a first pass at the effect designs, not tuned.
The full Spellbook gallery with replay is M13.2; world-specific completion moments are M13.3.
