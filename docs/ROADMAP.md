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
- [x] **M1.4** Game session API: action queue, event stream (collected, parked, portal, won, lost) for the renderer, undo snapshots. Thorough unit tests incl. edge cases.

## M2 — Solver & level generator

- [x] **M2.1** Solver: sequential-launch search with memoization; returns a solution and a difficulty score.
- [x] **M2.2** Generator: art grid → level (charge chunking, column interleaving, `K`/`T` selection) driven by a difficulty target; seeded RNG; rejects unsolvable output.
- [x] **M2.3** Level pipeline CLI: build all levels from art sources, embed solution + score, fail CI on any unsolvable or invalid level. Shuffle-booster re-solve helper.

## M3 — Playable prototype (Phaser)

- [x] **M3.1** Board scene: responsive portrait layout, mosaic rendering (fast batched pixels), track, portal, slots, summon columns.
- [x] **M3.2** Wisps: sprites, movement interpolated from sim steps, collection beam/particle, portal flight; 1×/2× speed.
- [x] **M3.3** Input & feedback: tap targets sized for thumbs, invalid-tap feedback, haptics, queued launches.
- [x] **M3.4** Win/lose flow: reveal animation of the finished illustration, lose dialog with free Retry, level select stub. Playable with 5 test levels.

## M4 — Content: 3 worlds × 20 levels

- [x] **M4.1** PNG → art importer and art preview tool (the ASCII art format shipped in M2.3).
- [x] **M4.2** World 1 "Moonlit Beginnings": 20 original artworks + lore lines, gentle curve with tutorial levels.
- [x] **M4.3** World 2 "Crystal Garden": 20 artworks + lore, layered colors introduced.
- [x] **M4.4** World 3 "Zodiac Realm": 20 artworks (12 signs + constellations) + lore, tighter slots.

## M5 — Progression, economy & rewards

- [x] **M5.1** Save system: IndexedDB with localStorage fallback, versioned migrations, no sign-up.
- [x] **M5.2** World map & level select with stars/completion, next-level auto-advance.
- [x] **M5.3** Coins & boosters: Undo, Shuffle, Extra Slot, Magic Wand, Revive; generous earn rates.
- [x] **M5.4** Rewards interface (provider-agnostic) with mock + "none" providers; 2× alternating free/ad policy; double-coins offer. Never blocks play.
- [x] **M5.5** Spellbook: collected illustrations, lore cards, world completion; win card says "Added to your Spellbook".

## M6 — Polish & native feel

- [x] **M6.1** Audio: original procedural SFX (WebAudio) + ambient music loop, mute/volume settings, unlock on first tap.
- [x] **M6.2** Juice: particles, screen transitions, combo sparkle, win celebration, idle hints.
- [x] **M6.3** Onboarding: interactive first-level tutorial, contextual tips for slots/boosters.
- [x] **M6.4** PWA: manifest, icons, offline caching, install prompt, update toast; performance budget check.
- [x] **M6.5** Accessibility & settings: colorblind symbols, reduced motion, haptics toggle, real-world moon-phase sky on the map.

## M7 — Website, analytics & launch

- [x] **M7.1** Astro landing page, `/spellbook` public gallery, `/blog` + FAQ, SEO/OG images.
- [x] **M7.2** Analytics abstraction (PostHog adapter, consent banner, key funnel events).
- [x] **M7.3** Deploy configs: Netlify (`netlify.toml`) and VPS (Docker + nginx), caching headers, docs.
- [x] **M7.4** Launch QA: device matrix pass, Lighthouse ≥ 90, bug bash fixes, v1.0.0 tag.

## v2.0.0 — Gameplay redesign (M8–M15)

M0–M7 above are the shipped v1.0.0 record and stay as they are. v2 replaces the perimeter-track
mechanic with a pick-up-and-deliver collection puzzle; context and measurements are in
`docs/V2_GAMEPLAY_AUDIT.md`, the rules will live in `docs/GAME_DESIGN_V2.md` (M8.2).

Rules for M8–M15:

- Same loop as before (one task = one branch = one PR; the PR ticks its box), with one change:
  a task starts when its dependencies are merged, and milestone boundaries do **not** pause for
  approval. Only the human gates below stop the run.
- v2 code is additive and unreachable by default (`?engine=v2`) until the switch in M15.5, because
  `main` is the deploy branch. v1 modules are not edited except for bug fixes.
- Passing CI is never recorded as human approval.

**Human gates**

| Gate | Task  | What must happen before anything behind it starts                          |
| ---- | ----- | -------------------------------------------------------------------------- |
| G1   | M10.5 | User has played the vertical slice and approved continuing.                |
| G2   | M11.3 | User has approved the representative art before any library or catalogue.  |
| G3   | M15.4 | Real first-time-player findings are recorded.                              |
| G4   | M15.5 | User explicitly approves; only then is the M15.5 PR merged and v2.0.0 cut. |

**A gate task's box is ticked only after the approval above**, in a follow-up docs PR (or, for G4,
by merging the PR). The gate PR itself uses `Refs #n`, leaves its box unticked and the issue open;
unticked, it keeps every task that `_Needs_` it blocked. The M15.5 PR is never merged before
approval. If the user does not approve, their feedback becomes new tasks in that milestone.

### M8 — Gameplay redesign and validation foundation

_Replace the perimeter-track concept with a clearly specified, strategic pick-up-and-deliver collection puzzle that is implementable, deterministic and testable._

- [x] **M8.1** Audit existing gameplay — Explain, with reproducible evidence, why the v1 track mechanic allows repetitive play and why its difficulty score does not measure meaningful decisions.
- [x] **M8.2** Design the new core gameplay (GAME_DESIGN_V2) — Write `docs/GAME_DESIGN_V2.md`, precise enough for an independent implementation and solver. _Needs M8.1._
- [x] **M8.3** Define reachability and blocked cubes — Specify the spatial collection system: which cubes a collector can physically reach and how outer cubes expose inner ones. _Needs M8.2._
- [x] **M8.4** Define strategic difficulty — Set measurable requirements for easy, medium and hard levels and for the anti-triviality tests. _Needs M8.2, M8.3._
- [x] **M8.5** Gameplay prototyping specification — Produce the technical design for one playable vertical slice and confirm the redesign is coherent, implementable, deterministic and testable. _Needs M8.2, M8.3, M8.4._

### M9 — Collection engine and puzzle simulation

_Replace perimeter-track collection with physical pickup-and-delivery rules in a pure TypeScript engine._

- [x] **M9.1** Collection and navigation engine — Implement the deterministic collection simulation in pure TypeScript, independent of Phaser. _Needs M8.5._
- [x] **M9.2** Numbered summon groups with real capacity — Make a group's number its true remaining collection capacity. _Needs M9.1._
- [x] **M9.3** Holding slots and queues — Implement limited holding slots that genuinely affect decisions, and rule-based loss. _Needs M9.2._
- [x] **M9.4** Deterministic game events and replay — Expose the event stream the renderer needs and prove replay reproduces logical state. _Needs M9.1, M9.2, M9.3._
- [x] **M9.5** Core simulation tests — Cover the whole rule set with tests and prove a full puzzle can be solved without a renderer. _Needs M9.1, M9.2, M9.3, M9.4._

### M10 — Animated magical collectors and vertical slice

_Make collecting cubes enjoyable to watch; deliver one polished playable level. Ends at human review gate G1._

- [x] **M10.1** Original magical familiars — Create one polished, original base familiar in colour variations that reads on a phone. _Needs M8.5._
- [x] **M10.2** Physical collection animation — Render the full pick-up-and-deliver sequence from the event stream. _Needs M9.4, M10.1._
- [x] **M10.3** Swarm behaviour — Show many collectors at once without clutter and without changing outcomes. _Needs M10.2._
- [x] **M10.4** Movement feedback and sound — Polish movement, carrying, pickup, deposit and completion feedback at 1× and 2×. _Needs M10.2, M10.3._
- [x] **M10.5** One complete playable level **(human gate)** — Deliver one manually designed, polished level on the new engine and stop for human evaluation of gameplay feel. _Needs M9.5, M10.4._ Box ticked only after the user approves (G1).

### M11 — High-quality witchcraft pixel art and world design

_Replace simplistic patterns with rich, meaningful magical illustrations. Contains art gate G2._

- [x] **M11.1** Visual art bible (ART_DIRECTION_V2) — Write `docs/ART_DIRECTION_V2.md`. _Needs M10.5._
- [x] **M11.2** Increase puzzle art density — Support roughly 24×24–40×40 art with hundreds of meaningful cells, sized by mobile testing. Includes the per-cell shade (family = gameplay colour, shade = look) in the level model and renderer (ART_DIRECTION_V2 §1). _Needs M11.1._
- [x] **M11.3** Representative magical art set **(human gate)** — Hand-craft a small representative set across the themes and stop for art review before any catalogue work. _Needs M11.1, M11.2, M11.4._ Box ticked only after the user approves the art (G2).
- [x] **M11.4** Improve the art pipeline — Extend the PNG import and preview tooling for production art. Implements the **[check]** rules of ART_DIRECTION_V2 as `npm run art:check`, replacing the single distance rule, plus provenance enforcement. _Needs M11.1._
- [x] **M11.5** Connect artwork to gameplay rewards — Make winning reveal and animate the artwork, and store it in the Spellbook with a lore card. _Needs M11.3, M11.4._

### M12 — Intelligent level generation and difficulty validation

_Make completion require thinking rather than repetitive tapping, with automated evidence of strategic depth._

- [x] **M12.1** Rebuild the solver — Solve v2 levels under the collection rules. _Needs M9.5, M8.4, M10.5._
- [x] **M12.2** Redesign the level generator — Generate levels from curated art with meaningful structure, deterministically. _Needs M12.1, M11.4._
- [x] **M12.3** Anti-triviality testing — Automate simulated players and reject levels that simple strategies beat. _Needs M12.1, M8.4._
- [x] **M12.4** Improve difficulty scoring — Score decisions, not just random losses. _Needs M12.3._
- [x] **M12.5** Design the difficulty curve — Define the progression and encode it as machine-checkable bands. _Needs M12.4._
- [x] **M12.6** Level quality reports and CI gate — Publish a per-level report and reject bad levels in CI. _Needs M12.2, M12.3, M12.4, M12.5._

### M13 — Magical progression, gameplay variety and engagement

_Give players meaningful reasons to continue._

- [ ] **M13.1** Redesign world progression — Give each of the three worlds a recognisable identity, and produce its levels after art approval. _Needs M11.3, M12.6._ **Partly done (structure, atmosphere, level plan: docs/V2_WORLDS.md); 4 of 60 levels exist, so the box stays unticked until the worlds are filled.**
- [ ] **M13.2** Spellbook as a collectible gallery — Show completed illustrations, names and lore, with replay. _Needs M11.5, M13.1._
- [ ] **M13.3** Meaningful completion moments — World-specific, skippable completion effects. _Needs M11.5, M13.1._
- [ ] **M13.4** Introduce selected puzzle variety — Evaluate and add at most one new mechanic at a time (locked fragments, barriers, order constraints, timed portals, limited assistance). _Needs M12.6._
- [ ] **M13.5** Daily challenges — Deterministic daily puzzle with completion tracking and spoiler-free sharing. _Needs M12.6._

### M14 — Player experience, rewards and retention

_Polish the complete loop while keeping monetization fair._

- [ ] **M14.1** Redesign the gameplay interface — Portrait-first, uncluttered play screen. _Needs M10.5, M12.6._
- [ ] **M14.2** Improve onboarding — Teach by interaction. _Needs M14.1._
- [ ] **M14.3** Correct the 2× speed rule — 2× unlocks only through an optional rewarded ad for the current level; replace the alternating free/ad policy. _Needs M9.4._
- [ ] **M14.4** Rebalance boosters and economy — Define and test each booster under the new rules. _Needs M9.5, M12.6._
- [ ] **M14.5** Instrument gameplay quality — Consent-gated anonymous gameplay events. _Needs M14.1._

### M15 — Quality assurance, playtesting, optimization and v2.0.0 release

_Deliver a production-quality upgrade validated by automated tests and human playtesting. Contains gates G3 and G4._

- [ ] **M15.1** Comprehensive gameplay tests — Test every rule and the save/resume path. _Needs M14.5._
- [ ] **M15.2** Gameplay regression and strategy testing — Validate every production level. _Needs M15.1._
- [ ] **M15.3** Performance and compatibility — Measure frame time and compatibility. Includes the on-device 60 fps measurement of the 32×32 shaded board (`?engine=v2&level=dense`) deferred from M11.2, which had no reference phone. _Needs M15.1._
- [ ] **M15.4** Human playability validation **(human gate)** — Run and record a small session with first-time players. _Needs M15.2, M15.3._ Box ticked only when real findings are recorded (G3); stays unticked while awaiting humans.
- [ ] **M15.5** Production readiness and release candidate **(human gate)** — Prepare v2.0.0 and stop for explicit approval before tagging or publishing. _Needs M15.4._ PR is not merged, and the box not ticked, until the user approves (G4).

## Later (post-MVP, not scheduled)

Worlds 4–6 (Familiar Forest, Arcane Library, Celestial Kingdom) · real ad provider (Google Ad Manager
rewarded / CrazyGames SDK) · web payments & shop · cloud saves (Supabase) · tarot card of the day · leaderboards · Capacitor Android/iOS builds.
