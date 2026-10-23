# The Spellbook as a collectible gallery (M13.2)

The v2 Spellbook (`?engine=v2`, "Spellbook" on the win screen, or `/play/?engine=v2&view=spellbook`)
is now a scrollable gallery of the whole art library, grouped by world.

## What it shows

- **Three world sections** in world order (Moonlit Beginnings, Crystal Garden, Zodiac Realm), each
  with its tagline from `worldIdentity.ts` and "N of M" collected. A piece belongs to the world that
  claims its theme (`worldForTheme`); a theme no world claims would go in a last "Other pages"
  section (none today).
- **A collected picture** is shown finished with its name. **An uncollected one is a silhouette with
  "?"**: its name is withheld, so a locked card gives nothing away.
- **A page** (tap a collected card): the finished picture, name, world, lore, "Completed N times" and
  the date of the first completion (UTC, `YYYY-MM-DD`), and two buttons: **Play it again** and
  **Close**.
- **Replay** starts that picture's level (`art-<id>`) on the board. The choice is kept in the
  Phaser registry (`v2.level`) and beats `?level=` in the address bar, so "Back to the board" from the
  Spellbook returns to the replayed level, not the default one. A reload starts from the address bar
  again. Replaying and winning again counts one more completion; it never un-collects anything.

## How it is built

- `gallery.ts` is pure: `buildGallery(book)` (sections, cards, counts) and `pageFor(book, id)` (page
  text), tested in `gallery.test.ts` without Phaser (grouping, silhouette secrecy, counts, first date
  kept across wins, unknown ids ignored, replay ids playable).
- `CollectSpellbookScene.ts` draws it: a sticky header and footer (`setScrollFactor(0)`, interactive
  so they swallow taps over scrolled cards), content scrolled by the shared `DragScroll`. A drag that
  scrolls is not a tap on a card, and scrolling is disabled while a page is open.
- Never blocks play: nothing is locked behind the gallery; "Back to the board" is always in the
  footer, and replay is free and instant.

## Verified, and not

Checked in the browser pane at 375×812 with a seeded book (two pieces collected): the three sections
and counts, silhouettes, the finished cards, scrolling to the bottom, a page (name, world, lore,
"Completed once · first on 2026-10-22"), and **Play it again** loading `art-libra-scales` on the board.
Logic is unit-tested. **Not checked:** touch dragging on a real phone (the wheel was used), small
phones where the page's text plus two buttons may crowd, and any large library: all 6 pieces are laid
out on every redraw, which is fine at this size but should become lazy before the 60-slot library.
Only 6 of the 60 world slots exist, so most of each world is still empty (docs/V2_WORLDS.md).
