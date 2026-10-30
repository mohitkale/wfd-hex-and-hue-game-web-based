# Hex & Hue: Magic Pixel Puzzle

Web-first, free-to-play magical pixel puzzle for the witchy / pagan / astrology / fantasy community:
pick a box, and familiars fetch, carry and deliver every cube of its colour until the picture is
cleared. Repo: `mohitkale/wfd-hex-and-hue-game-web-based`.

- Gameplay rules: `docs/GAME_DESIGN_V2.md` (source of truth). `docs/GAME_DESIGN.md` is the v1 track
  mechanic, shipped as v1.0.0 and removed from the code in M15.13 (historical).
- The levels: the **witch's journey** (`packages/game/src/collect/journey.ts`), 24 pictures in six
  chapters, easy → medium → hard → extreme finale; see `docs/V2_TRAYS.md` and the cookbook
  `docs/COOKBOOK.md` (how the game is built, and the problems solved to make it play well).
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
- **Speed (M14.3, changed in M15.6):** 1× is free and the default; 3× unlocks for the current level only through an optional
  rewarded ad. No working provider → no 3× offer is shown; failure never blocks play; no fake rewards.
  Speed changes only when the player chooses it, except that once no box is left to choose (every
  column empty) the rest of the level plays at 3× by itself (owner request, M15.13); nothing bought
  for one attempt (3×, the Lantern, extra trays) carries to a retry or another level.
  Speed changes presentation only, never outcomes.
- **v2 gameplay:** collectors physically pick up, carry and deliver cubes; a group's number is real
  remaining capacity; poor choices can cause a genuine deadlock; levels must resist simple
  strategies (column-spam, greedy). Do not reskin the track engine.
- Ads, analytics and payments sit behind provider-agnostic interfaces; the engine never imports a
  vendor SDK.
- All art, names, audio and UI are original. Inspiration from the reference game is mechanical only,
  and its name appears nowhere in the project.
- Art must read: every level plays in the fixed picture palette (`PICTURE_PALETTE`, every pair of
  colours at least ΔE 27 apart), in the bordered style (`pixelCanvas.ts`: one-cell outlines round and
  between regions), at most 10 colours per level (colour-blind symbols). A hard level keeps its normal
  trays; its difficulty comes from the picture and its deal (`tools/collect/journey.ts`).
- v2 art is hand-crafted and original; no bulk low-quality placeholders, no random "detail" noise,
  and no catalogue work before gate G2.

## Architecture

```
packages/core   pure TS engine: core/src/collect (rules, simulation, solver, simulated players,
                generator), seeded RNG, ASCII art parser (no DOM, no Phaser)
packages/game   Phaser 4: src/collect (board, home map, Spellbook, familiars, journey pictures);
                shared audio, haptics, analytics, rewards, save, view helpers
apps/web        Astro site: / landing, /play (mounts the game full-screen), /spellbook, /blog
content/        v2 art library (v2art), difficulty bands, v2 curve and world planning
tools/          collect/ (journey deals, production gate, reports), art/, perf/ (budget), icons/
```

- Since M15.13 the game is v2 only: v1 (track engine, scenes, levels, tools) was removed and
  `/play` mounts the board directly. **`main` is the deploy branch**: never leave it in a state that
  would break the shipped game, and never merge a PR without the owner's manual approval.
- `core` is deterministic: seeded RNG only, no `Date.now()`/`Math.random()` in logic, state is plain
  serializable data. Renderer interpolates between sim steps; it never mutates game state directly.
- Prefer small pure functions with Vitest unit tests in `core`; Phaser code is kept thin.

## Commands

```
npm install          # once
npm run dev          # Astro dev server with the game at /play (no flag needed)
npm run verify       # lint + typecheck + test + build + budget (must pass before any PR)
npm test             # vitest (includes the shipped-level check)
npm run art:journey  # dist/journey-sheet.html: the 24 journey pictures at phone size
npm run journey:deal # deal journey levels without a deal (or `-- j-broom` to redo one; commit the JSON)
npm run art:import -- art.png name   # PNG pixel art → AsciiArt snippet for the v2 art library
npm run art:check    # v2 art library: art-bible rules + provenance/review (in verify/CI)
npm run art:sheet    # dist/art-sheet.html: v2 pieces at full and phone size with rule results
npm run art:levels    # playable preview level per v2 art piece (committed JSON; test fails if stale)
npm run strategy:report # simulated players per level and tiers satisfied (docs/V2_STRATEGIES.md)
npm run levels:report  # dist/levels-report.html: v2 level quality report (docs/V2_LEVEL_GATE.md)
npm run levels:check   # v2 level gate: unsolvable/trivial/out-of-band fail (in verify/CI)
npm run measures:report # decision measures + difficulty score per level (docs/V2_MEASURES.md)
npm run solver:report # solver over the slice and art preview levels (docs/V2_SOLVER.md)
npm run seals:report # wax seals vs simple players on the art pieces (docs/V2_VARIETY.md)
npm run density      # cube size per phone and bot play time per board size (docs/V2_ART_DENSITY.md)
npm run icons        # regenerate PWA icons (apps/web/public/icons) from tools/icons/icon.ts
npm run budget       # check the production build against the performance budget (in verify/CI)
```

## Conventions

- TypeScript strict, ES modules, Node 24. Prettier formatting, ESLint clean.
- Branch: `m<milestone>.<task>-<slug>` (e.g. `m1.3-step-simulation`).
- Commits: Conventional Commits (`feat(core): …`, `fix(game): …`, `chore(ci): …`).
- PR title: `M1.3: Step simulation` (v2: `M9.1: Collection and navigation engine`). Body: summary, how tested, `Closes #<issue>`.
- Merge with squash; delete the branch.
