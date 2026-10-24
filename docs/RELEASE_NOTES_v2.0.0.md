# Hex & Hue 2.0: release notes (draft, not published)

> Draft for the owner's approval. Nothing here is released: no tag, no deploy. Reflect only what is
> true in the build; edit freely.

## What's new

**A new way to play.** You no longer launch wisps around a board. You summon a _group_ of little
familiars; they fly out of the portal, fetch the cubes of their colour, carry them home one by one and
count the group's number down. The number is real: it is how many cubes that group can still bring.
Free up a buried colour, send a waiting group out again, and finish the picture.

- **Real decisions.** Groups wait in a limited number of holding slots. Choose the wrong order and a
  level can genuinely fail (slots full, or a deadlock). Undo takes your last move back.
- **Every level solver-verified**, and checked in CI against simple strategies.
- **Learn by doing.** A four-level tutorial with six-word hints that point at what to tap.
- **Spellbook gallery** grouped by world, a **daily challenge** (the same picture for everyone, a
  streak, a share text that never spoils), and a finished-picture moment with lore.
- **Three worlds' atmospheres:** moonlit candle sparks, twinkling crystal, orbiting stars.
- **Boosters:** Undo, +1 Slot and Hint, all earnable with coins from clearing pictures. 2× speed is an
  optional ad for one level.
- **Comfort:** a Menu with colour symbols, reduced motion, sound, music and vibration; larger tap
  targets; installable and playable offline.

## Still true

Free forever. No lives, no energy, no timers, no paywalled levels. Retry is free and instant. Ads are
optional and never block play. Progress stays on your device; analytics are anonymous and only if you
agree.

## If you played before

Your coins and boosters come with you (Shuffle and Magic Wand become Hints). Your old levels and stars
stay in the old game, which is still available at `/play/?engine=v1`. See
[V2_MIGRATION.md](V2_MIGRATION.md).

## Known limits (be honest in the announcement)

- The pictures: six hand-drawn pieces so far, none yet reviewed by a person; five are easy for cheap
  play. The three worlds are not filled (4 of 60 planned levels are placed on the difficulty curve).
- First-time-player testing (gate G3) and on-device performance are still to be done
  ([V2_PLAYTEST.md](V2_PLAYTEST.md), [QA.md](QA.md)).
- No world map in v2 yet; the Spellbook is the gallery.
