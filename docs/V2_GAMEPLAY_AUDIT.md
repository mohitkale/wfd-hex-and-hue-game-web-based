# v2 Gameplay Audit

_Written at the start of the v2.0.0 effort (roadmap M8–M15), against `main` at `3eff890` / tag `v1.0.0`
(released 2026-10-22)._

This document records what exists, what is reusable, what must be replaced, and the risks of
changing the core of a shipped game. It is a planning document: the new rules live in
`docs/GAME_DESIGN_V2.md` (M8.2), and `docs/GAME_DESIGN.md` stays as the historical v1 spec until the
v2 switch (M15.5).

## 1. Why v2

The v1.0.0 build is technically complete (60 levels, solver-verified, offline PWA, analytics,
deployment) but a first-hand play test found the core loop unsatisfying: wisps circle the outside of
the mosaic, fragments just vanish, numbers feel like counters, the same few taps clear most levels,
and the art is simple geometry. Those are product-design failures, not polish gaps. The reference
feel is "creatures that go and fetch things" (Food Hunt-style pixel puzzles); v1's track is a
different mechanic wearing similar clothes.

## 2. Verified baseline (v1.0.0)

- Tag `v1.0.0` and the GitHub release exist; `main` is clean and equal to `origin/main`.
- Milestones `M0`–`M7` are closed on GitHub (issues #1–#32, all merged, one PR each).
- CI (`.github/workflows/ci.yml`): lint, format, typecheck, test, build, budget, plus a Docker/nginx
  smoke test.
- `main` is the deploy branch (Netlify builds from it via `netlify.toml`; the VPS image is built from
  the checkout). **Anything merged to `main` can reach production.** See risk R1.

## 3. How v1 actually plays (measured)

The v1 rules: wisps loop clockwise around the mosaic, collect the first fragment in line of sight if
the colour matches, charge counts down, a wisp that finishes a lap with charge left parks in one of
`K` slots, and a loss is "lap finished and no free slot". The solver and generator use a
_sequential_ model (one wisp at a time, each finishing its lap before the next launch).

I played the 60 shipped levels with seven simple automatic strategies in that same sequential model
(one run each; `random` averaged over 40 seeds). Figures are the share of levels won.

| Strategy                                      | Moonlit (1–20) | Crystal (21–40) | Zodiac (41–60) | All 60  |
| --------------------------------------------- | -------------- | --------------- | -------------- | ------- |
| Always the first column (then next)           | 45%            | 40%             | 20%            | 35%     |
| Always the last column                        | 55%            | 25%             | 10%            | 30%     |
| Largest charge first                          | 35%            | 15%             | 20%            | 23%     |
| Smallest charge first                         | 5%             | 15%             | 0%             | 7%      |
| Random available wisp                         | 71%            | 62%             | 60%            | 64%     |
| Wisp that collects the most right now         | 75%            | 45%             | 40%            | 53%     |
| **Wisp that will finish its charge (greedy)** | **95%**        | **100%**        | **95%**        | **97%** |

(Reproducible script: becomes `tools/audit/strategies.ts` in M8.1.)

What this says:

1. **There is one dominant trivial strategy**, and it is not "tap column 1 then column 2". Picking
   the wisp that can empty its whole charge now wins 58 of 60 levels with no look-ahead. Column
   order is a weaker lever: first-column wins only 35% overall (every strategy wins the first
   tutorial levels, and a few mid levels fall to it, e.g. moonlit-07 to -09). The player's report
   of "tap this column, then that one" is the _feel_ of the greedy rule, which is easy to discover.
2. **Random play wins 64%.** A game where blind tapping wins two of three levels has no tension
   until deep into the curve, and even the last Zodiac level is won by random play 10% of the time.
3. **Difficulty is mostly "which slot did I waste".** Losses come from filling `K` slots; there is no
   spatial or timing decision, because the sequential model means the player's only decision is
   _which front wisp next_.

## 4. Why the mechanic produces repetitive play

- **One decision type.** Each move picks one of ≤ 4 column fronts or ≤ 5 parked wisps. Which cell a
  wisp collects is decided by geometry (first fragment in line of sight), never by the player.
- **No physical consequences.** Collection is a ray from a lane cell; there is nothing to block,
  reach, carry, or wait for. Blocking is only "a different colour is in front", which the greedy
  rule reads straight off the board.
- **Waiting is free and total.** Because the player can wait, the engine's own solvability proof
  assumes one wisp at a time; simultaneous wisps never create interesting interactions. The
  `trackCap` (default 5) is never a constraint in the intended solution.
- **Numbers are counters.** A wisp's charge is "how many fragments until this vanishes". It has no
  position, no travel time, and no relationship to what it collects.
- **The generator makes levels solvable by construction** (`naturalSequence`: a greedy clearing
  order, then re-chunked and shuffled). So the _winning_ order always follows the natural unlock
  order of colours, and the "shuffle" lever only buries wisps rather than creating alternatives.

## 5. Why the difficulty score does not measure decisions

`difficultyScore = 0.7·lossRate + 0.3·minSlots/slots` (`packages/core/src/solver.ts`).

- `lossRate` comes from a _single_ novice policy ("random among wisps that collect something").
  That is one point on the strategy map above; levels the greedy rule beats can still get a high
  score if the random novice loses.
- `minSlots/slots` measures slot slack, not the number of meaningful alternatives.
- Nothing counts how many first moves are _tempting but losing_, how deep planning must go, or how
  many distinct winning lines exist. Two levels can share a score while one has a single forced
  path and the other forgives everything.
- The curve in `content/curve.ts` then _targets_ this score with hill-climbing, so it optimises
  the weak proxy directly.

M12.3/M12.4 replace this with multi-strategy success rates and decision metrics.

## 6. Art and content findings

- The art format (`AsciiArt`, `packages/core/src/art.ts`) is a character grid with ≤ 16 palette
  colours. Shipped artworks are at most 23 cells across, with **3–8 colours** and 62–324 filled cells.
- `tools/art/check.ts` rejects any two colours closer than redmean distance 90 and any colour too
  dark for the panel. That guard is right for colour _matching_ (a wisp must match a fragment by
  hue) but it makes **shading, highlights and anti-aliasing impossible inside one artwork**. It is a
  direct cause of the "simple, geometric" look. v2 needs a two-tier approach: collector/cube
  matching colour families must stay distinct, while shading within a family (ramps) is allowed and
  checked separately.
- Content was authored as code (`content/art/*.ts`, drawing helpers in `draw.ts`): shapes are drawn
  procedurally. The PNG importer exists (`tools/art/import.ts`) but no hand-pixelled art has
  shipped.
- Lore lines exist per level, but gameplay never reflects the subject (a Cauldron plays like a
  Crescent).

## 7. Component inventory

### Reuse as is (no gameplay coupling)

| Area                                                                                     | Where                                                           |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Astro site, blog, FAQ, SEO/OG, sitemap                                                   | `apps/web`                                                      |
| PWA (manifest, service worker, update toast, install flow), icons                        | `packages/game/src/pwa.ts`, `tools/icons`                       |
| Deployment (Netlify, Docker/nginx, headers + tests), perf budget                         | `netlify.toml`, `deploy/`, `tools/deploy`, `tools/perf`         |
| CI workflow, lint/format/typecheck config                                                | `.github/`, root config                                         |
| Save system (IndexedDB + localStorage, migrations, merge across tabs)                    | `packages/game/src/save/*`                                      |
| Analytics abstraction + consent                                                          | `packages/game/src/analytics/*`                                 |
| Audio engine (WebAudio mixing, unlock, volumes); sound _designs_ get extended            | `packages/game/src/audio/engine.ts`                             |
| Haptics, accessibility/reduced-motion/colorblind plumbing, layout maths, display helpers | `haptics.ts`, `a11y.ts`, `layout.ts`, `display.ts`, `motion.ts` |
| Seeded RNG                                                                               | `packages/core/src/rng.ts`                                      |
| Level pipeline shape (content → generated JSON → CI check) and ASCII art parser          | `tools/levels`, `core/src/art.ts`                               |
| Rewards provider interface, mock + none providers                                        | `packages/game/src/rewards/{types,providers,index}.ts`          |
| Scenes that are not the board (title, settings, world map, spellbook)                    | `scenes/*` except `PlayScene`                                   |
| Art PNG import + palette tooling                                                         | `tools/art/*` (extended in M11.4)                               |

### Replace

| Area                                                                    | Why                                                                                                            | Replaced in                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `core/src/track.ts`, `sim.ts` (track, lap, line-of-sight)               | The perimeter-track model is the problem.                                                                      | M9.1 (new engine alongside) |
| `core/src/session.ts` (queue, undo of track state)                      | Built around launch queue and track entry.                                                                     | M9.4                        |
| `core/src/solver.ts`, `generator.ts`, `shuffle.ts`, `boosters.ts`       | Encode sequential-launch semantics and the v1 difficulty score.                                                | M12.1–M12.4, M14.4          |
| `core/src/level.ts` (`columns`, `trackCap`, fragment==charge invariant) | New level model: groups, portal, reachability. Charge invariant changes meaning (capacity vs reachable cubes). | M9.1/M9.2                   |
| `game/src/view/WispView.ts`, `MosaicView.ts`, `BoardChrome.ts`          | Rendering of lanes, beams, abstract wisps.                                                                     | M10.1–M10.4, M14.1          |
| `game/src/scenes/PlayScene.ts` (1,801 lines)                            | Board orchestration tied to track events. Split into smaller modules while rebuilding.                         | M10, M14.1                  |
| `game/src/hint.*`, `hinter.ts`, `tips.ts`                               | Hints and tutorial are written for the track model.                                                            | M14.2                       |
| `rewards/speed.ts` (alternating free/ad)                                | Wrong monetisation rule; see M14.3.                                                                            | M14.3                       |
| `content/worlds`, `content/art`, `content/curve.ts`                     | 60 simple levels; v2 curve and art bible.                                                                      | M11–M13                     |
| `docs/GAME_DESIGN.md`                                                   | Describes v1. Kept until the switch, then marked historical.                                                   | M15.5                       |

## 8. Architectural direction

- **Additive core.** Add the collection engine as a new namespace (`packages/core/src/collect/…`)
  exported separately. v1 modules stay compiled and tested until the switch, so the shipped game
  keeps working.
- **Keep the contract of `core`:** pure TypeScript, seeded RNG only, plain serialisable state,
  renderer interpolates and never mutates state, events are the only channel to the renderer.
- **Time model.** The v1 sim is one-cell-per-step. The v2 sim is also stepped (fixed logical ticks)
  so replay, solving and the 2× speed multiplier are exact; the renderer interpolates collectors
  between ticks. Pathfinding runs on a grid with deterministic tie-breaking (BFS with a fixed
  neighbour order), never in the render loop.
- **Solver scope.** Simultaneity must not blow up search. The M8.2 spec has to define a canonical
  "settled" abstraction (as v1 did with "idle") that the solver can search while the live game
  allows overlapping groups. This is the single biggest technical risk (R2).
- **Replace `PlayScene` by decomposition, not editing in place.** New board view modules are
  introduced behind a flag and the old scene is deleted at the switch.

## 9. Migration risks

| ID  | Risk                                                                                                                                                                                               | Mitigation                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `main` auto-deploys; half-built v2 reaching players, or a regression in v1.                                                                                                                        | v2 code is additive and unreachable by default. `?engine=v2` / `PUBLIC_ENGINE=v2` selects the new board for development and review builds. The switch is a single, reviewed PR in M15.5.                                                                                                                             |
| R2  | Solver cost explodes once groups overlap and cubes reserve concurrently.                                                                                                                           | Define a canonical settled model in M8.2/M8.5; prove in M9.5 that the live game can always reproduce a solver line; budget node counts per level in M12.                                                                                                                                                             |
| R3  | Save compatibility: progress is keyed by level id (`levels["moonlit-04"]`), the Spellbook shows those levels, `speedTurns` drives the old alternation, boosters are `undo/shuffle/extraSlot/wand`. | v2 levels get new ids (`v2-…`); v1 progress is kept, never deleted. `SAVE_VERSION` 2 migration moves `levels` to `legacy.levels`, preserves coins, boosters (mapped per M14.4), settings and Spellbook entries, drops `speedTurns` (additive default). Documented in M15.5; test fixtures of real v1 saves in M15.1. |
| R4  | Performance: many animated collectors and cubes versus the 60 fps and 450 KB budget (Phaser bundle is ~385 KB gzip).                                                                               | Pooled sprites, one batched cube layer, pathfinding in the sim at spawn time with cached paths, per-level collector cap. Measure on a mid-range Android early (M10.3), not at the end.                                                                                                                               |
| R5  | Art cost: hundreds of cells per illustration at hand quality is slow; bulk placeholders would repeat v1's weakness.                                                                                | Mandatory art gate before any catalogue work; ≤ 8 reference pieces first.                                                                                                                                                                                                                                            |
| R6  | Analytics funnels and docs reference v1 events and level ids.                                                                                                                                      | Event names stay; add `engine` property; new events in M14.5.                                                                                                                                                                                                                                                        |
| R7  | Autonomous run produces a technically green but unfun game.                                                                                                                                        | Human gates: after the vertical slice (M10.5), after representative art (M11), playtest evidence before release (M15.4), explicit approval before tag (M15.5). Green CI is never recorded as approval.                                                                                                               |

## 10. Recommendations

1. Build v2 additively and keep `main` shippable v1 until the single switch PR.
2. Treat the solver's _settled-state abstraction_ as the first design deliverable of M8.2, before any
   engine code.
3. Land the strategy-audit script (M8.1) in `tools/audit` so the same eight strategies become the
   M12.3 anti-triviality gate, and so v1 numbers above stay reproducible.
4. Replace the single palette-distance rule with "families + ramps" in the art pipeline (M11.4).
5. Keep one `v1` maintenance line available: if a v1 hotfix is ever needed after the switch, branch
   from tag `v1.0.0`.
6. Do not mass-produce levels until the M10.5 vertical slice is judged fun by a person.
