# v2 human playability validation (M15.4, gate G3)

**Status: awaiting humans.** No first-time player has played the v2 build for this task. This
document holds the plan and an empty observation sheet; the findings section is empty on purpose.
Nothing in CI, the solver, the simulated players or the production report
([V2_PRODUCTION_REPORT.md](V2_PRODUCTION_REPORT.md)) counts as a finding, and M15.5 (the v2.0.0
release candidate) stays blocked until real findings are recorded and approved here.

## What the build is

- The v2 board is reachable at `/play/?engine=v2` on the deployed site (and `npm run dev`, usually
  `http://localhost:4321/play/?engine=v2`). A **first visit starts in the four-level tutorial**
  ([V2_ONBOARDING.md](V2_ONBOARDING.md)); afterwards the player is on the slice level. Other doors,
  for the facilitator only: `?level=slice` (skips the tutorial), `?level=art-black-cat` and the other
  `art-*` pictures, `?level=daily`, `?view=spellbook`.
- The **Menu** button under the HUD opens sound, music, vibration, colour-symbol and reduced-motion
  switches without leaving the level.
- Boosters, coins and the optional 3× ad and the free end-game sprint are described in [V2_BOOSTERS.md](V2_BOOSTERS.md) and
  [V2_SPEED.md](V2_SPEED.md). With no ad provider configured there is no 3× button.
- Use a fresh browser profile (or clear site data) for each tester: progress lives in `localStorage`
  (`hexhue.v2.*`).
- Known limits the tester will meet: five of the six pictures are easy for cheap play
  ([V2_PRODUCTION_REPORT.md](V2_PRODUCTION_REPORT.md)); art is unreviewed; no world map yet (the
  Spellbook is the gallery); v2 is not offline-capable. Do not "fix" these in the session; record
  whether they get in the way.

## Who and how many

Five testers is a useful first round; three is the minimum worth recording. First-time players only:
people who have not seen this game or its v1 and who are not on the team. At least two who play
casual puzzle games on a phone, and ideally one from the witchy / pagan / astrology / fantasy
audience the game is for. Ask each tester's permission to take notes; record **no names**: use T1,
T2, ... and an age band if they volunteer it.

## Setup (per session, ~15 minutes)

1. Their own phone if possible (portrait, browser they normally use); otherwise a phone you lend.
   Note the device and browser.
2. Fresh profile, `/play/?engine=v2` opened for them. Say only: "Play this like you'd play any game.
   Think aloud if you like. I won't help unless you're stuck for a minute."
3. Do not explain the rules, the colours or the buttons. If they are stuck for 60 seconds, note
   where, give the smallest nudge, and note what the nudge was.
4. Let them play: the tutorial, then whatever follows, for about ten minutes or until they stop.
   Stopping is data: note when, and whether they chose to.
5. Afterwards ask the questions below. Do not lead.

## What to observe (the sheet)

One row per tester per item. Record what happened, in their words where possible, then a short code.

| #   | Question            | Observe                                                                                                                                                                                    | Code                         |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| 1   | **Controls**        | Do they tap columns, waiting groups and Undo without help? Any wrong taps or missed taps? Does anything feel slow or unresponsive?                                                         | ok / struggled / blocked     |
| 2   | **Tutorial**        | Did they complete all four tutorial levels? Where did they stop or get stuck? Did they read, ignore or skip the hints (Skip)? _(This is the M14.2 criterion that only humans can answer.)_ | completed / partly / skipped |
| 3   | **Collectors**      | Do they watch the familiars fetch and carry? Do they enjoy it, ignore it, or find it slow? Do they ever want 2× (only on a build with an ad provider; otherwise there is no button)?       | enjoyed / neutral / slow     |
| 4   | **Numbers**         | Can they say what the number on a group means? (Ask: "what does the 8 mean?")                                                                                                              | understood / partly / no     |
| 5   | **Art**             | Do they recognise the picture as it fills or when it finishes? Do they care?                                                                                                               | recognised / no / cared      |
| 6   | **Decisions**       | Do they make intentional choices (picking an order, saving a group for later), or tap at random? Quote what they say they're planning.                                                     | planning / mixed / random    |
| 7   | **Losing**          | When they lose, do they know why? What do they do: Undo, Retry, stop?                                                                                                                      | understood / confused        |
| 8   | **Retry**           | Do they want to try again after a loss, without being asked?                                                                                                                               | yes / no                     |
| 9   | **Boosters**        | Do they notice the tray (+Slot, Hint) and the coins? Do they use them; do they understand the cost?                                                                                        | used / noticed / missed      |
| 10  | **Continuing**      | After the first level they could stop: do they play another one voluntarily? How many levels in ten minutes?                                                                               | continued / stopped          |
| 11  | **Feel**            | On a phone: does it feel native (no scroll, no zoom, no lag)? Any readability problem with cube size? Anything on the board too small to tap or read?                                      | good / issues                |
| 12  | **Their own words** | "What would you tell a friend about it?" "What was confusing?" "What would make you come back?"                                                                                            | verbatim                     |

Also note: the commit or build tested, device, browser, whether sound and haptics were on, and any crash or visual glitch.

## Findings

**First-time-player sessions (G3): none yet; still awaiting humans.**

### Owner's own first play (2026-10-28), not a first-time player

The owner played the release-candidate build on desktop (the tutorial, then the slice) and sent five
screenshots with this feedback. It is one person who knows the game, so it counts as owner review, not
as the G3 evidence; it is recorded here as it was said.

1. **Look.** "Does not look aesthetically great", compared with Food Hunt; wants the puzzle boxes
   "more colorful and clean", "more visually stunning" and "the latest hyper-casual fun game for the
   witch community rather than an 8-bit game".
2. **Group boxes.** The numbered coloured boxes are "not of consistent shape and size"; the pixel
   character on the box is not understood and should go.
3. **WORKING strip.** The empty WORKING holders are "totally useless". Only the pending coloured
   boxes should exist; a working group should show its working effect on its own box.
4. **Portal.** The hole characters return to should be separate from the coloured picture so the
   animation can be seen.
5. **Speed.** Default 1×; make the speed-up 3× instead of 2×; when the working group holds the final
   cubes, switch to 3× for free to end the game faster.
6. **Characters.** Make them look like a flying bat or a running or walking cat.
7. **Tutorial.** Played three levels as "training levels"; no comment on the hints.

A second round, after the M15.6 and M15.7 build (2026-10-28):

8. By default the build showed v1 (the served branch was `main`; v2 is the default only on the release
   candidate branch).
9. "Unnecessary background outer bordered stuff outside the puzzle box": a waste of space.
10. The upcoming numbers were stacked on each other; wanted a proper grid with spacing, at most the next
    three boxes of a column visible, the rest hidden "to make the game unpredictable and full of surprise".
11. When a column is used up, the remaining columns should be centred, always.
12. Tapping a box still showed the WORKING box separately from the PENDING one. Wanted one place: the
    box goes into a bordered active area (as many places as may be active at once, always shown), a tray
    opens, the characters come out of the box and go to their coloured cubes while the number updates,
    and at zero the tray closes before the box disappears (as in Food Hunt).
13. Bats and cats a little smaller and monocoloured; only the eyes may contrast.

A third round (2026-10-28):

14. "You are still managing a separate tray for the PROGRESS and PENDING states": there must be **one
    tray row** that shows progress and also holds the pending box. The play screen is three parts, top to
    bottom: the PUZZLE, the TRAYS, the COLOURED BOXES. The boxes are a grid with the same spacing across
    and down; early levels have three columns but levels will grow, so the grid must scale. Up to five
    trays, with a power to add an extra tray.

A fourth round (2026-10-28):

15. The characters run "pretty fast" by default.
16. After some time the game crashed (a blank board with empty buttons; a screenshot was sent).
17. A pending box should resume **by itself** as soon as its coloured cubes can be taken, with the tray
    staying open; the player must not have to tap it.

Items 8 to 13 are tracked as M15.8 item 14 as M15.9 and items 15 to 17 as M15.10. Items 1 to 7 are tracked as M15.6 (#151: items 2 to 5) and M15.7 (#152: items 1 and 6). Item 5's free end-game 3×
changes the rule in CLAUDE.md ("1× is free; 2× only through an optional rewarded ad"): the owner
asked for it, so the rule is updated to match (docs/V2_SPEED.md).

When sessions are done, add one section per tester here (T1, T2, ...) with the filled rows above,
then a summary: how many completed the tutorial and where the others got stuck, what was confusing,
what delighted, and every problem ranked by how many testers hit it. Only things people did or said
go in this document. Fixes that follow become new tasks in the M15 milestone.

## Also asked of whoever holds a phone (carried from M15.3, docs/QA.md "Not measured")

- **Offline v2 from an installed PWA** (expected to fail until M15.5 moves the v2 chunk into the
  service worker's shell; record what happens, or state it is deferred to M15.5).
- **On-device frame rate** of `/play/?engine=v2&level=dense&profile=1` (steps in
  [V2_PERF.md](V2_PERF.md#real-device-measurement-not-done-tracked-as-m153-issue-103)); record device,
  browser and the numbers. The profiler (`window.__collect`) only exists in a build made with
  `PUBLIC_ENGINE=v2` or in dev; the deployed site may not expose it, so follow the V2_PERF.md steps.
- Whether the booster tray's buttons (drawn about 30 px tall, 44 px tap zones) are comfortable to tap, and whether cubes are
  readable on the smallest phone in the session (cube size on short phones fell with the tray: QA.md).
- Touch feel, audio unlock and haptics on iOS Safari and Android Chrome.

## Decisions this round should inform

- Do the tutorial hints work for real first-time players, or does the wording need changing?
- Are tutorial-grade pictures (five of the six) acceptable as the daily and first content, or do
  they need the layered redesign first ([V2_PRODUCTION.md](V2_PRODUCTION.md))?
- Is the Undo price (one booster or 15 coins) and the starting kit felt as fair?
- Is the 3× rewarded-ad offer understood and acceptable, and is the free end-game sprint noticed and welcome?
- Is the v2 game fun enough to replace v1 at M15.5?
