---
name: continue-roadmap
description: Work through docs/ROADMAP.md autonomously — pick the next task, branch, implement, open a PR, wait for CI, review, fix, squash-merge, return to main and continue; stop only at the human gates. Use when the user says continue / next task / keep going / resume the roadmap.
---

# Continue the Hex & Hue roadmap

Repo: `mohitkale/wfd-hex-and-hue-game-web-based`. Source of truth for what's next: `docs/ROADMAP.md`.
Rules of the game: `docs/GAME_DESIGN.md` (v1, M0–M7) and `docs/GAME_DESIGN_V2.md` (v2, M8–M15, once
M8.2 has merged). Product principles: `CLAUDE.md`. Why v2 exists: `docs/V2_GAMEPLAY_AUDIT.md`.

## 0. Sync and orient

```bash
git checkout main && git pull --ff-only
gh pr list --state open --json number,title,headRefName
```

- If an open PR exists for a roadmap task, **resume it** (jump to step 3 or 4 based on its state)
  instead of starting new work.
- Otherwise the next task is the first `- [ ]` line in `docs/ROADMAP.md` **whose `_Needs …_`
  dependencies are all ticked** and that is not itself awaiting approval (step 1). If none
  qualifies, report what is blocking (usually a human gate).

## 1. Gates

**M0–M7 (historical):** the loop stopped at every milestone boundary.

**M8–M15 (v2):** the roadmap is approved, so crossing a milestone boundary does **not** pause the
run. Close the finished GitHub milestone, post a one-line summary, and continue.

The loop **stops at the human gates**, or when a task needs a decision outside its scope (product
direction, money, accounts, credentials). A gate task has the `human-gate` label and is marked
**(human gate)** in the roadmap.

| Gate | Task  | Approval needed before anything behind it starts                                             |
| ---- | ----- | -------------------------------------------------------------------------------------------- |
| G1   | M10.5 | User has played the vertical slice and approved continuing. No M11+ work until then.         |
| G2   | M11.3 | User has approved the representative art. No art library or catalogue before then.           |
| G3   | M15.4 | Real first-time-player findings are recorded. No release candidate without them.             |
| G4   | M15.5 | User explicitly approves the release. Never merge the switch, tag, release or deploy before. |

**Approval is recorded by the roadmap box.** A gate task's box is ticked only after the user
approves, never by the gate PR itself. Everything behind the gate lists it under `_Needs …_`, so it
stays blocked until then. Mechanics:

- The gate PR uses `Refs #n` (not `Closes`), does **not** tick the box, and the issue stays open.
  G1, G2 and G3 PRs may be merged (they are additive and unreachable by default). **The G4 PR
  (M15.5) must not be merged** until the user approves: it flips the default engine on the deploy
  branch and migrates saves.
- After merging a gate PR, post the playable build or evidence, instructions to reproduce it and
  specific questions, then stop. An unticked gate task whose PR is merged (or, for G4, open and green) is
  **awaiting approval**: skip it, and do not start tasks that need it.
- When the user approves in chat, record it: comment on the gate issue quoting the approval, tick
  the box in a small docs PR (for G4: merge the PR, then tag only if the user said to), close the
  issue, continue.
- If the user does not approve, their feedback becomes new tasks in the same milestone, added to the
  roadmap and as issues; the gate box stays unticked until a later round is approved.
- Green CI, solver output or simulated players are never approval or human feedback. Never invent
  feedback. M15.4 stays unticked while it is _awaiting humans_.

## 2. Implement

```bash
ISSUE=$(gh issue list --state open --search "Mx.y in:title" --json number -q '.[0].number')
git checkout -b mx.y-short-slug
```

- Read the issue: objective, scope, acceptance criteria and test requirements are the task's contract.
- Implement exactly the task's scope; keep it reviewable (split if a PR would exceed ~1,000 changed
  lines excluding generated level data).
- Add/extend tests. `packages/core` logic needs unit tests for every rule it touches.
- Tick the task's box in `docs/ROADMAP.md` in the same branch.
- Run `npm run verify` locally and fix everything before pushing.
- **v2 safety (`main` auto-deploys):** v2 code is additive and unreachable by default until M15.5;
  do not change v1 behaviour that players can see.
- If something needs the user's decision (product direction, money, accounts, credentials, an ad
  provider), stop and ask — never guess on those. Reasonable engineering decisions that need none of
  those are yours to make; record them in the relevant doc.

## 3. Open the PR

```bash
git push -u origin HEAD
gh pr create --title "Mx.y: <task name>" --body "<summary>\n\n## How tested\n...\n\nCloses #$ISSUE\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

## 4. Wait for CI

Run `gh pr checks <n> --watch --fail-fast` **in the background** (Bash `run_in_background`) and
continue when notified. On failure: read logs (`gh run view --log-failed`), fix, push, wait again.

## 5. Review

Spawn the `pr-reviewer` agent with the PR number. It returns findings ranked by severity. Post them as
one PR comment (`gh pr comment <n> --body-file …`). Fix every correctness or principle violation;
note any deliberately deferred nit in the comment. Push fixes and repeat step 4.

## 6. Merge and continue

```bash
gh pr merge <n> --squash --delete-branch
git checkout main && git pull --ff-only
```

The `Closes #n` line closes the issue (gate PRs use `Refs #n`, see step 1); confirm it did. Then loop back to step 0. After merging the
last task of a milestone, close the GitHub milestone
(`gh api -X PATCH repos/{owner}/{repo}/milestones/<id> -f state=closed`), apply step 1.

## Guardrails

- Never force-push to `main`, never merge with red CI, never skip review.
- Never commit secrets; vendor keys go in env vars documented in `.env.example`.
- Never integrate a paid provider, enable billing or require credentials without approval.
- Never tag or publish a release without explicit approval (G4).
- Optimise for a game people enjoy, not for ticking boxes: a task is done when its acceptance
  criteria hold, not when CI is green.
- Keep the user informed with one line per merged PR.
