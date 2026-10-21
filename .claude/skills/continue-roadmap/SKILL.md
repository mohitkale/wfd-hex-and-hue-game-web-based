---
name: continue-roadmap
description: Work through docs/ROADMAP.md autonomously — pick the next task, branch, implement, open a PR, wait for CI, review, fix, squash-merge, return to main and continue; pause for the user's OK at each milestone boundary. Use when the user says continue / next task / keep going / resume the roadmap.
---

# Continue the Hex & Hue roadmap

Repo: `mohitkale/wfd-hex-and-hue-game-web-based`. Source of truth for what's next: `docs/ROADMAP.md`.
Rules of the game: `docs/GAME_DESIGN.md`. Product principles: `CLAUDE.md`.

## 0. Sync and orient

```bash
git checkout main && git pull --ff-only
gh pr list --state open --json number,title,headRefName
```

- If an open PR exists for a roadmap task, **resume it** (jump to step 3 or 4 based on its state)
  instead of starting new work.
- Otherwise the next task is the first `- [ ]` line in `docs/ROADMAP.md`.

## 1. Milestone gate

If the next task is the first task of a milestone (`Mx.1`) and the user has not explicitly approved
starting that milestone in the current conversation, **stop**: post a short summary of the milestone
just finished (what shipped, PR links, anything deferred) and ask whether to start `Mx`. Do not open
branches for it until they say yes. The very first milestone (M0) counts as approved by the request
that created this loop.

## 2. Implement

```bash
ISSUE=$(gh issue list --state open --search "Mx.y in:title" --json number -q '.[0].number')
git checkout -b mx.y-short-slug
```

- Implement exactly the task's scope; keep it reviewable (split if a PR would exceed ~1,000 changed
  lines excluding generated level data).
- Add/extend tests. `packages/core` logic needs unit tests for every rule it touches.
- Tick the task's box in `docs/ROADMAP.md` in the same branch.
- Run `npm run verify` locally and fix everything before pushing.
- If something needs the user's decision (product, money, accounts, credentials), stop and ask —
  never guess on those.

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

Then loop back to step 0. After merging the last task of a milestone, close the GitHub milestone
(`gh api -X PATCH repos/{owner}/{repo}/milestones/<id> -f state=closed`) and hit the gate in step 1.

## Guardrails

- Never force-push to `main`, never merge with red CI, never skip review.
- Never commit secrets; vendor keys go in env vars documented in `.env.example`.
- Keep the user informed with one line per merged PR.
