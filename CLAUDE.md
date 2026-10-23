# Hex & Hue: Magic Pixel Puzzle

Web-first, free-to-play magical color-sorting puzzle (track-around "pixel flow" mechanic) for the
witchy / pagan / astrology / fantasy community. Repo: `mohitkale/wfd-hex-and-hue-game-web-based`.

- Gameplay rules: `docs/GAME_DESIGN.md` (v1 track mechanic, shipped as v1.0.0). **v2 rules:**
  `docs/GAME_DESIGN_V2.md` (source of truth for the new engine).
- Plan and progress: `docs/ROADMAP.md` (milestones `M0…M15`, one PR per task, mirrored as GitHub
  milestones + issues). `M0…M7` are the shipped v1.0.0 record; `M8…M15` are the v2.0.0 redesign.
- Why v2 exists and what is reusable: `docs/V2_GAMEPLAY_AUDIT.md`.

## Autonomous delivery loop

When the user says anything like "continue", "next task", "keep going", "resume the roadmap", or opens
a session without another specific request in this project, run the **continue-roadmap** skill
(`.claude/skills/continue-roadmap/SKILL.md`). In short:

1. Sync `main`, find the first unchecked task in `docs/ROADMAP.md` whose dependencies are merged
   (resume its open PR if one exists).
2. Branch → implement with tests → `npm run verify` → tick the roadmap box → PR (`Closes #<issue>`).
3. Wait for CI, review the PR with the `pr-reviewer` agent, fix findings, wait for CI again.
4. Squash-merge, delete the branch, switch back to `main`, continue with the next task.
5. **Milestone gate (M0–M7 only, now historical):** the v1 loop stopped for the user's OK at every
   milestone boundary.
6. **v2 (M8–M15) gates:** the roadmap is approved, so milestone boundaries do **not** pause the run.
   Post a one-line milestone summary, close the GitHub milestone and continue. The run stops at the
   four **human gates** (or when a task needs a product, money, account or credential decision): **G1** after M10.5 (playable vertical slice), **G2** after M11.3
   (representative art), **G3** M15.4 (human playtest evidence) and **G4** M15.5 (explicit approval
   before tagging or publishing v2.0.0). At a gate: post the build, evidence and specific questions,
   then wait. A gate's roadmap box is ticked only after the user approves (the gate PR uses
   `Refs`, not `Closes`), which keeps everything behind it blocked; the M15.5 PR is never merged
   before approval, because merging it switches production to v2. Green CI, solver results or simulated players are never recorded as human approval.

## Non-negotiable product principles

- **Never block play.** No lives, energy, timers, paywalled levels or forced ads. Retry is always free
  and instant. Every booster is also earnable by playing. If an ad fails, the game continues.
- **Every shipped level is solver-verified.** Generation must never produce an unwinnable board.
- **Native mobile feel:** portrait-first, full-bleed, no scroll/zoom, same-frame touch response,
  haptics, 60 fps on mid-range phones, offline PWA.
- **2× speed:** v1 alternates free → rewarded ad (`docs/GAME_DESIGN.md` §3). **v2 rule (M14.3):**
  1× is free; 2× unlocks for the current level only through an optional rewarded ad. No working
  provider → no 2× offer is shown; failure never blocks play; no fake rewards; 2× changes
  presentation speed, never outcomes.
- **v2 gameplay:** collectors physically pick up, carry and deliver cubes; a group's number is real
  remaining capacity; poor choices can cause a genuine deadlock; levels must resist simple
  strategies (column-spam, greedy). Do not reskin the track engine.
- Ads, analytics and payments sit behind provider-agnostic interfaces; the engine never imports a
  vendor SDK.
- All art, names, audio and UI are original. Inspiration from Food Hunt is mechanical only.
- Art must read on the dark board: CI rejects colors too dark for the panel or too similar to
  each other in one artwork (`tools/art/check.ts`). v2 art (M11) replaces the single distance rule
  with colour families for matching and shading ramps within a family.
- v2 art is hand-crafted and original; no bulk low-quality placeholders, no random "detail" noise,
  and no catalogue work before gate G2.

## Architecture

```
packages/core   pure TS engine: level model, track, simulation, solver, generator (no DOM, no Phaser)
packages/game   Phaser 4 scenes, rendering, input, audio; consumes core's session API + event stream
apps/web        Astro site: / landing, /play (mounts the game full-screen), /spellbook, /blog
content/        worlds, level configs and ASCII pixel art (source of truth for levels)
tools/levels/   level pipeline: content → packages/game/src/levels/generated/*.json (+ CI check)
```

- v2 engine lives beside v1 in `packages/core/src/collect/` and is unreachable by default
  (`?engine=v2`) until the switch in M15.5, because **`main` is the deploy branch**. Do not edit v1
  modules except to fix bugs; never leave `main` in a state that would break the shipped game.
- `core` is deterministic: seeded RNG only, no `Date.now()`/`Math.random()` in logic, state is plain
  serializable data. Renderer interpolates between sim steps; it never mutates game state directly.
- Prefer small pure functions with Vitest unit tests in `core`; Phaser code is kept thin.

## Commands

```
npm install          # once
npm run dev          # Astro dev server with the game at /play
npm run verify       # lint + typecheck + test + build + budget (must pass before any PR)
npm test             # vitest (includes the shipped-level check)
npm run levels       # rebuild stale levels after editing content/ or core engine files (commit the JSON)
npm run art:import -- art.png name   # PNG pixel art → AsciiArt snippet for content/art
npm run art:preview  # dist/art-preview.html: all levels, stats and difficulty curve
npm run art:check    # v2 art library: art-bible rules + provenance/review (in verify/CI)
npm run art:sheet    # dist/art-sheet.html: v2 pieces at full and phone size with rule results
npm run art:levels    # playable preview level per v2 art piece (committed JSON; test fails if stale)
npm run strategy:report # simulated players per level and tiers satisfied (docs/V2_STRATEGIES.md)
npm run levels:report  # dist/levels-report.html: v2 level quality report (docs/V2_LEVEL_GATE.md)
npm run levels:check   # v2 level gate: unsolvable/trivial/out-of-band fail (in verify/CI)
npm run measures:report # decision measures + difficulty score per level (docs/V2_MEASURES.md)
npm run solver:report # solver over the slice and art preview levels (docs/V2_SOLVER.md)
npm run density      # cube size per phone and bot play time per board size (docs/V2_ART_DENSITY.md)
npm run audit:v1      # v1 audit: simple-strategy win rates per level (add -- --decisions for decision profile)
npm run icons        # regenerate PWA icons (apps/web/public/icons) from tools/icons/icon.ts
npm run budget       # check the production build against the performance budget (in verify/CI)
```

## Conventions

- TypeScript strict, ES modules, Node 24. Prettier formatting, ESLint clean.
- Branch: `m<milestone>.<task>-<slug>` (e.g. `m1.3-step-simulation`).
- Commits: Conventional Commits (`feat(core): …`, `fix(game): …`, `chore(ci): …`).
- PR title: `M1.3: Step simulation` (v2: `M9.1: Collection and navigation engine`). Body: summary, how tested, `Closes #<issue>`.
- Merge with squash; delete the branch.
