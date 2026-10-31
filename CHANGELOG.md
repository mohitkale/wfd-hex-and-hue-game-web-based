# Changelog

## Unreleased

- **Install:** the browser's own "Install app" prompt is no longer held back (it waited for an
  in-game offer that v2 does not have).
- **Fix:** the game no longer stops loading when its window is briefly very narrow (a booster button
  could get a negative size while the window was being resized).
- **Site:** the FAQ, privacy page, landing page and blog posts now describe the current game (its
  boosters, the 3× speed ad, the journey's chapters, sound and music switches), not v1.
- **Cleanup:** leftover v1 code removed: the game's Undo booster (an old pouch's Undo count is
  dropped), analytics events no longer sent, unused ad placements, the motes layer, an unused slider
  control and the old three-world plan.

## 2.0.0 (2026-10-31)

A new game on the same site: the v1 track puzzle is replaced by the familiars.

- **New play:** pick a box and your familiars come out of its potion bottle, fetch one cube each from
  the edge of the picture, carry it to the hole and dive in. Every tray works whenever its colour can
  be reached; poor picks can jam every tray (Retry is free; an Extra Tray can rescue you).
- **The witch's journey:** 24 hand-drawn pictures in six chapters (The Calling, Hedge & Herbs,
  Crystals, Moon & Stars, Familiars & Spirits, The Grimoire), each climbing from easy to an extreme
  finale with a word in it. Every level is solver-verified and held to its tier: random tapping wins at
  most about 45 % of medium, 25 % of hard and 10 % of extreme levels.
- **Look:** bright, finely detailed pixel mosaics (about 700 to 1,850 small cubes per picture), the
  boxes' trays shown as stoppered potion bottles.
- **Choose your familiar:** bat, cat, ant, owl, frog or spider, each drawn from above with its own
  anatomy and walk.
- **Home:** a scrollable night-sky map with chapters; the Spellbook collects every finished picture
  with its lore; a daily challenge.
- **Boosters, all earnable by playing:** Extra Tray, Familiar's Call, Besom Sweep, Crystal Lantern,
  Hint. 3× speed for a level via an optional rewarded ad; nothing ever blocks play.
- **Mobile first:** fits every phone without scrolling, 30 fps with an idle sleep, offline PWA.
- **Site:** the landing page, gallery and share images show the journey.
- **Short levels:** every tier has a cube budget (easy 900, medium 1,300, hard 1,700, finales
  2,000), and every picture is drawn at the scale that fits it, with crisp one-cube outlines. Easy
  pictures stand alone on the board; medium and hard ones have a halo of backdrop (stripes of the
  art's own colour on hard levels). Boxes are big (mostly 24 to 48): about 20 to 70 taps a level.
- **Every level on its difficulty target**, and proven winnable (`docs/V2_PRODUCTION_REPORT.md`).
- **Removed:** the v1 game (wisps, worlds, its levels and tools). Settings carry over; the new game
  has its own coins and starts every player with one of each booster.

## 1.0.0 (2026-10-23)

First public release.

- **Game:** track-around wisp puzzle with 60 solver-verified levels in three worlds (Moonlit
  Beginnings, Crystal Garden, Zodiac Realm), each revealing an original illustration and lore for
  the Spellbook.
- **Never blocks play:** no lives, energy or timers; free instant Retry; skip after three losses;
  every booster (Undo, Shuffle, +1 Slot, Magic Wand) earnable with coins; 2× speed alternating free
  and optional ad; optional rewarded ads only.
- **Feel:** procedural sound and music, haptics, particles, combos, confetti, idle hints from a
  background solver, scene transitions.
- **Onboarding:** an interactive first-level tutorial and one-time contextual tips.
- **Accessibility:** color symbols, reduced motion, volume and vibration settings; tonight's real
  moon phase on the map.
- **App:** installable, plays fully offline, updates with a "new version" prompt; local saves, no
  account.
- **Website:** landing page, public Spellbook gallery, blog, FAQ, privacy page, share cards,
  sitemap.
- **Analytics:** optional, anonymous and consent-first (PostHog over HTTP, no SDK, no cookies).
- **Deploy:** Netlify config and a Docker + nginx image for a VPS, with strict security headers.
