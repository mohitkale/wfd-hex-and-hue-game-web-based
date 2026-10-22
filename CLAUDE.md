# Hex & Hue: Magic Pixel Puzzle

Web-first, free-to-play magical color-sorting puzzle (track-around "pixel flow" mechanic) for the
witchy / pagan / astrology / fantasy community. Repo: `mohitkale/wfd-hex-and-hue-game-web-based`.

- Gameplay rules: `docs/GAME_DESIGN.md` (source of truth for the engine).
- Plan and progress: `docs/ROADMAP.md` (milestones `M0…M7`, one PR per task, mirrored as GitHub
  milestones + issues).

## Autonomous delivery loop

When the user says anything like "continue", "next task", "keep going", "resume the roadmap", or opens
a session without another specific request in this project, run the **continue-roadmap** skill
(`.claude/skills/continue-roadmap/SKILL.md`). In short:

1. Sync `main`, find the first unchecked task in `docs/ROADMAP.md` (resume its open PR if one exists).
2. Branch → implement with tests → `npm run verify` → tick the roadmap box → PR (`Closes #<issue>`).
3. Wait for CI, review the PR with the `pr-reviewer` agent, fix findings, wait for CI again.
4. Squash-merge, delete the branch, switch back to `main`, continue with the next task.
5. **Milestone gate:** when the last task of a milestone is merged, post a milestone summary and
   **stop for the user's OK** before starting the next milestone. Tasks inside a milestone run
   without asking.

## Non-negotiable product principles

- **Never block play.** No lives, energy, timers, paywalled levels or forced ads. Retry is always free
  and instant. Every booster is also earnable by playing. If an ad fails, the game continues.
- **Every shipped level is solver-verified.** Generation must never produce an unwinnable board.
- **Native mobile feel:** portrait-first, full-bleed, no scroll/zoom, same-frame touch response,
  haptics, 60 fps on mid-range phones, offline PWA.
- **2× speed** alternates free → rewarded ad → free…; no-fill on an ad turn keeps 1× and the next
  turn is free (see `docs/GAME_DESIGN.md` §3).
- Ads, analytics and payments sit behind provider-agnostic interfaces; the engine never imports a
  vendor SDK.
- All art, names, audio and UI are original. Inspiration from Food Hunt is mechanical only.
- Art must read on the dark board: CI rejects colors too dark for the panel or too similar to
  each other in one artwork (`tools/art/check.ts`).

## Architecture

```
packages/core   pure TS engine: level model, track, simulation, solver, generator (no DOM, no Phaser)
packages/game   Phaser 4 scenes, rendering, input, audio; consumes core's session API + event stream
apps/web        Astro site: / landing, /play (mounts the game full-screen), /spellbook, /blog
content/        worlds, level configs and ASCII pixel art (source of truth for levels)
tools/levels/   level pipeline: content → packages/game/src/levels/generated/*.json (+ CI check)
```

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
npm run icons        # regenerate PWA icons (apps/web/public/icons) from tools/icons/icon.ts
npm run budget       # check the production build against the performance budget (in verify/CI)
```

## Conventions

- TypeScript strict, ES modules, Node 24. Prettier formatting, ESLint clean.
- Branch: `m<milestone>.<task>-<slug>` (e.g. `m1.3-step-simulation`).
- Commits: Conventional Commits (`feat(core): …`, `fix(game): …`, `chore(ci): …`).
- PR title: `M1.3: Step simulation`. Body: summary, how tested, `Closes #<issue>`.
- Merge with squash; delete the branch.
