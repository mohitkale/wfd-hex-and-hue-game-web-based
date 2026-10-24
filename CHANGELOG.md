# Changelog

## 2.0.0 (unreleased: release candidate, awaiting approval)

A new game on the same site: **v2 replaces the track puzzle**. See
[docs/RELEASE_NOTES_v2.0.0.md](docs/RELEASE_NOTES_v2.0.0.md) for the player-facing notes and
[docs/V2_MIGRATION.md](docs/V2_MIGRATION.md) for what happens to existing saves.

- **Game:** summon groups of familiars that physically fetch, carry and deliver the cubes of a
  hand-drawn picture; a group's number is real remaining capacity; holding slots, genuine
  deadlocks, wax seals; interactive four-level tutorial; daily challenge; Spellbook gallery by
  world; world atmospheres and completion moments.
- **Never blocks play (unchanged):** no lives, energy or timers; free instant Retry. Boosters are
  now Undo, +1 Slot and Hint, earned with coins. 2× speed is an optional rewarded ad for one level.
- **Quality:** every shipped level is solver-verified and gated in CI (`production:check`); a
  consent-gated, anonymous gameplay event stream; an in-game settings menu.
- **Migration:** coins and boosters carry over once; the v1 save is never touched. `?engine=v1`
  still runs the old game as a fallback.
- **App:** the v2 board is part of the offline shell (hashed chunk, precached).

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
