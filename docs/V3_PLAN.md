# Hex & Hue v3: the Grimoire

Status: **approved to start (2026-11-01).** M16–M18 are scheduled in `docs/ROADMAP.md`; the
rest waits for the gate V2 evaluation. Every feature ships with at most **two demos** (topics) so it
can be judged, kept, changed or dropped before more content is made.

## The idea in one line

v2 is a puzzle you play. v3 makes Hex & Hue the place a witch _practises_: learn a ritual by doing it
on a pixel altar, collect correspondences as cards, follow the real moon and the Wheel of the Year,
and keep a private Book of Shadows, all in the same art, familiars and never-block-play spirit.

## Principles for v3 (added to the v2 ones)

- **Learn by doing, then by knowing why.** Every lesson is hands-on first (drag, light, trace, draw),
  then a short "why" card. No walls of text; a lesson takes 2–5 minutes.
- **No guilt mechanics.** Streaks never break and nothing is lost for missing a day; "practice days"
  only ever count up. Nothing is paywalled; same rules as "never block play".
- **Tradition-respectful.** Content is eclectic and open-practice (circle casting, elements,
  correspondences, moon work, tarot, sigils, the modern Wheel of the Year). Closed practices
  (for example Hoodoo, Vodou, Santería, specific Indigenous ceremonies) are not taught or gamified.
  Where traditions differ, the lesson says so ("many witches…, others…").
- **Safety in the content, not as fine print.** Toxic herbs are flagged and never suggested for
  ingesting, smoke or skin; fire safety appears in every candle lesson; nothing is medical,
  financial or legal advice; no spells aimed at harming or controlling another person.
- **Private by default.** Faith and practice data (journals, birth details, spell logs) is
  special-category personal data under GDPR. It stays on the device (local-first, like the save
  today); any sync or sharing is opt-in and comes later behind a gate.
- **Original content.** Lessons, card text and art are written for Hex & Hue. Public techniques
  (the letter-elimination sigil, planetary squares, moon phases) are described in our own words.
- **Practitioner review.** Every lesson is checked by a real practitioner before it ships (a human
  gate, like G2 for art). Simulated or AI review never counts as that check.

## Features (max two demos each)

### F1. Ritual Rehearsal: gamified Spellbook rituals (the headline)

A ritual becomes a short interactive scene on a pixel altar. Each step is an action: place the tools
where they belong, light candles in the right order, walk the circle, trace a symbol, breathe with
an on-screen pulse. A wrong move is gently corrected, never punished. After the run, a "why" page
explains each step, and the ritual is written into the player's Spellbook as a printable card.

- Demo 1: **Casting and closing a circle** (four directions and elements, calling in and releasing).
- Demo 2: **A simple candle intention spell** (choosing a colour, dressing the candle, focus, safe
  snuffing).
- Game tie-in: your chosen familiar is your helper on the altar; finishing a ritual unlocks a lore
  page in the existing Spellbook.

### F2. Correspondence Cards: a collectible grimoire

Herbs, crystals, colours, days, planets and elements as collectible pixel cards. Cards are earned by
learning, not bought: short match games ("which crystal for calm?", "pair the herb with its
element") with gentle spaced repetition, so what you learn stays.

- Demo 1: **Crystals**, a 12-card deck.
- Demo 2: **Kitchen herbs**, a 12-card deck with clear safety badges (safe to cook, external only,
  do not use).

### F3. Living Sky: moon and Wheel of the Year

The real moon phase and sign, worked out on the device with no network (a deterministic astronomy
routine in `packages/learn`, tested against published tables; it takes the date as a parameter
and the caller reads the clock, so the maths stays deterministic). Each phase has a small "moon quest"; each
sabbat is a seasonal event with its own lesson, palette and a journey picture.

- Demo 1: **Moon tracker and moon quests** (eight phases, one quest each).
- Demo 2: **Yule event** (21 December 2026, the next sabbat after Samhain).

### F4. Tarot Apprentice

Learn tarot through a daily draw: guess the card's meaning from its imagery, then see it; practise
spreads with prompts; keep the reading in your journal. All 78 cards need original art, so the demos
stay small.

- Demo 1: **The first six Major Arcana** as a learning path (original pixel cards).
- Demo 2: **Three-card spread practice** (past, present, future) using those cards.

### F5. Sigil Forge

Make your own sigil, visually and step by step, then charge it with a short focus moment and keep it.

- Demo 1: **Letter-elimination sigil**: write an intention, watch repeated letters and vowels fall
  away, then draw the remaining letters into one shape and simplify it.
- Demo 2: **Planetary square sigil**: trace the intention's numbers across a magic square (Saturn's
  3×3) to draw the line.

### F6. Book of Shadows (private journal)

A local-only journal that knows the moon phase and what you practised: a ritual you rehearsed, a card
you drew, a sigil you made. A spell log can remind you later to note what happened. Exportable as a
file you own.

- Demo 1: **Moon-phase journal entry** (prompted by the current phase).
- Demo 2: **Spell log with a follow-up** ("three weeks ago you lit a green candle for…").

### F7. Star Self: astrology basics

Learn astrology from your own "big three" (sun, moon, rising), worked out on the device from birth
date, time and place, which never leave the device. Taught as a constellation you light star by star.

- Demo 1: **Your big three**, explained in three short lessons.
- Demo 2: **Today's sky**: which planet is where, and what that is said to mean.

### F8. The Path: one progression across everything

A single apprentice-to-adept path: each lesson, deck, ritual and quest lights a node on a skill tree
(Elements, Moon, Herbs and Stones, Divination, Symbols, Sabbats). Titles and familiar cosmetics are
earned; nothing is sold. The v2 puzzle feeds the same path.

- Demo 1: **The Elements branch** (fed by F1, F2 and F5).
- Demo 2: **Titles and familiar cosmetics** for the first two ranks.

### F9. Circles: community, without a backend first

A community feature that works before accounts exist, then grows.

- Demo 1: **Shareable cards**: any ritual, sigil or reading becomes a beautiful image to post
  (Web Share), with no account and no server.
- Demo 2: **Full-moon circle** (needs a small backend, behind a gate): at each full moon, everyone
  who lights a candle in the app adds to a shared count ("2,140 witches lit a candle tonight").
  Covens, chat or user-made spells are out of scope until moderation is decided.

## How it would be built

- **`packages/learn`** (new, pure TypeScript like `core`): lesson and ritual step models, card decks,
  spaced repetition, moon and sky maths, sigil geometry, path rules. Deterministic and unit-tested.
- **Content as data** in `content/grimoire/` (lessons, decks, cards), checked in CI by a
  `grimoire:check` (every herb has a safety badge, every candle lesson has fire safety, every lesson
  has a reviewer record), like `art:check`.
- **UI**: the reading-heavy parts (lessons, cards, journal) as Astro pages with small, accessible DOM
  islands. The hands-on scenes are light DOM scenes too (decided in M17.1: the altar is about 6 KB
  gzip and loads on first use, where Phaser would add about 400 KB to every lesson page); they
  reuse the game's familiar drawing and vibration patterns (`@hexhue/game/familiar`). Every gesture
  has a button twin for people who cannot draw on a screen. All offline in the PWA.
- **Site**: a new `/grimoire` hub next to `/play`; the home map gets a door to it.
- **Save**: the existing local save, extended; journal export and import as a file.

## Proposed order and gates

Scheduled (`docs/ROADMAP.md`):

1. **M16, foundation:** `packages/learn`, content format and check, `/grimoire` hub, Path skeleton.
2. **M17, F1 Ritual Rehearsal** (both demos). **Gate V1 (M17.5):** owner rehearses both rituals;
   practitioner review of the content.
3. **M18, F3 Living Sky + F2 Cards** (Yule must land before 21 December 2026). **Gate V2 (M18.7):**
   owner evaluates every demo so far: keep, change, drop, and what comes next.

Not scheduled until gate V2:

4. F5 Sigil Forge + F6 Book of Shadows.
5. F4 Tarot + F7 Star Self.
6. F8 Path (beyond the M16.4 skeleton) + F9 shareable cards. A decision on a backend (accounts,
   moderation, privacy notice) comes before any full-moon circle.
7. Explicit approval before tagging v3.0.0.

## Questions for the owner

1. ~~Which features to start with~~ Answered 2026-11-01: F1, then F3 and F2 (M16–M18).
2. Who reviews the lessons as a practitioner (you, or someone you trust)?
3. Is a backend (for example Supabase) acceptable later for F9, with the privacy work that implies?
4. Any traditions you want named or left out, beyond the closed practices above?
