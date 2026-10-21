# Roadmap

Each task = one branch = one PR. The PR that implements a task also ticks its box here.
Status legend: `[ ]` todo · `[x]` merged. A milestone is done when all its boxes are ticked.

The autonomous delivery loop that works through this file is defined in `CLAUDE.md` and
`.claude/skills/continue-roadmap/SKILL.md`.

## M0 — Foundation

- [x] **M0.1** Workspace scaffold: npm workspaces (`packages/core`, `packages/game`, `apps/web`), TypeScript, ESLint, Prettier, Vitest, root scripts (`lint`, `typecheck`, `test`, `build`).
- [x] **M0.2** CI: GitHub Actions running lint, typecheck, test, build on every PR and on `main`.
- [x] **M0.3** App shells: Phaser 4 game package with a boot scene; Astro site with `/` and full-screen `/play` mounting the game; mobile viewport/no-zoom/safe-area setup.

## M1 — Core engine (pure TypeScript, no rendering)

- [x] **M1.1** Level data model & JSON schema: mosaic grid, palette, summon columns, `K`, `T`; validation of the charge/fragment invariant.
- [x] **M1.2** Track geometry: perimeter path, lane directions, line-of-sight lookup per track cell.
- [x] **M1.3** Step simulation: launch, movement, collection, portal exit, lap completion, holding slots, track cap, win/lose. Deterministic and serializable.
- [ ] **M1.4** Game session API: action queue, event stream (collected, parked, portal, won, lost) for the renderer, undo snapshots. Thorough unit tests incl. edge cases.

## M2 — Solver & level generator

- [ ] **M2.1** Solver: sequential-launch search with memoization; returns a solution and a difficulty score.
- [ ] **M2.2** Generator: art grid → level (charge chunking, column interleaving, `K`/`T` selection) driven by a difficulty target; seeded RNG; rejects unsolvable output.
- [ ] **M2.3** Level pipeline CLI: build all levels from art sources, embed solution + score, fail CI on any unsolvable or invalid level. Shuffle-booster re-solve helper.

## M3 — Playable prototype (Phaser)

- [ ] **M3.1** Board scene: responsive portrait layout, mosaic rendering (fast batched pixels), track, portal, slots, summon columns.
- [ ] **M3.2** Wisps: sprites, movement interpolated from sim steps, collection beam/particle, portal flight; 1×/2× speed.
- [ ] **M3.3** Input & feedback: tap targets sized for thumbs, invalid-tap feedback, haptics, queued launches.
- [ ] **M3.4** Win/lose flow: reveal animation of the finished illustration, lose dialog with free Retry, level select stub. Playable with 5 test levels.

## M4 — Content: 3 worlds × 20 levels

- [ ] **M4.1** Pixel-art authoring format (palette + ASCII grid) and PNG → art importer.
- [ ] **M4.2** World 1 "Moonlit Beginnings": 20 original artworks + lore lines, gentle curve with tutorial levels.
- [ ] **M4.3** World 2 "Crystal Garden": 20 artworks + lore, layered colors introduced.
- [ ] **M4.4** World 3 "Zodiac Realm": 20 artworks (12 signs + constellations) + lore, tighter slots.

## M5 — Progression, economy & rewards

- [ ] **M5.1** Save system: IndexedDB with localStorage fallback, versioned migrations, no sign-up.
- [ ] **M5.2** World map & level select with stars/completion, next-level auto-advance.
- [ ] **M5.3** Coins & boosters: Undo, Shuffle, Extra Slot, Magic Wand, Revive; generous earn rates.
- [ ] **M5.4** Rewards interface (provider-agnostic) with mock + "none" providers; 2× alternating free/ad policy; double-coins offer. Never blocks play.
- [ ] **M5.5** Spellbook: collected illustrations, lore cards, world completion.

## M6 — Polish & native feel

- [ ] **M6.1** Audio: original procedural SFX (WebAudio) + ambient music loop, mute/volume settings, unlock on first tap.
- [ ] **M6.2** Juice: particles, screen transitions, combo sparkle, win celebration, idle hints.
- [ ] **M6.3** Onboarding: interactive first-level tutorial, contextual tips for slots/boosters.
- [ ] **M6.4** PWA: manifest, icons, offline caching, install prompt, update toast; performance budget check.
- [ ] **M6.5** Accessibility & settings: colorblind symbols, reduced motion, haptics toggle, real-world moon-phase sky on the map.

## M7 — Website, analytics & launch

- [ ] **M7.1** Astro landing page, `/spellbook` public gallery, `/blog` + FAQ, SEO/OG images.
- [ ] **M7.2** Analytics abstraction (PostHog adapter, consent banner, key funnel events).
- [ ] **M7.3** Deploy configs: Netlify (`netlify.toml`) and VPS (Docker + nginx), caching headers, docs.
- [ ] **M7.4** Launch QA: device matrix pass, Lighthouse ≥ 90, bug bash fixes, v1.0.0 tag.

## Later (post-MVP, not scheduled)

Worlds 4–6 (Familiar Forest, Arcane Library, Celestial Kingdom) · real ad provider (Google Ad Manager
rewarded / CrazyGames SDK) · web payments & shop · cloud saves (Supabase) · daily challenge & tarot
card of the day · leaderboards · Capacitor Android/iOS builds.
