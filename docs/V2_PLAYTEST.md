# v2 human playability validation (M15.4, gate G3)

**Status: awaiting humans.** No first-time player has played the v2 build for this task. This
document holds the plan and an empty observation sheet; the findings section is empty on purpose.
Nothing in CI, the solver, the simulated players or the production report
([V2_PRODUCTION_REPORT.md](V2_PRODUCTION_REPORT.md)) counts as a finding, and M15.5 (the v2.0.0
release candidate) stays blocked until real findings are recorded and approved here.

## What the build is

- The v2 board is reachable at `/play/?engine=v2` on the deployed site (and `npm run dev`, then
  `http://localhost:4400/play/?engine=v2`). A **first visit starts in the four-level tutorial**
  ([V2_ONBOARDING.md](V2_ONBOARDING.md)); afterwards the player is on the slice level. Other doors,
  for the facilitator only: `?level=slice` (skips the tutorial), `?level=art-black-cat` and the other
  `art-*` pictures, `?level=daily`, `?view=spellbook`.
- Boosters, coins and the optional 2× ad are described in [V2_BOOSTERS.md](V2_BOOSTERS.md) and
  [V2_SPEED.md](V2_SPEED.md). With no ad provider configured there is no 2× button.
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
| 3   | **Collectors**      | Do they watch the familiars fetch and carry? Do they enjoy it, ignore it, or find it slow? Do they ever want 2× (and is the ad offer clear)?                                               | enjoyed / neutral / slow     |
| 4   | **Numbers**         | Can they say what the number on a group means? (Ask: "what does the 8 mean?")                                                                                                              | understood / partly / no     |
| 5   | **Art**             | Do they recognise the picture as it fills or when it finishes? Do they care?                                                                                                               | recognised / no / cared      |
| 6   | **Decisions**       | Do they make intentional choices (picking an order, saving a group for later), or tap at random? Quote what they say they're planning.                                                     | planning / mixed / random    |
| 7   | **Losing**          | When they lose, do they know why? What do they do: Undo, Retry, stop?                                                                                                                      | understood / confused        |
| 8   | **Retry**           | Do they want to try again after a loss, without being asked?                                                                                                                               | yes / no                     |
| 9   | **Boosters**        | Do they notice the tray (+Slot, Hint) and the coins? Do they use them; do they understand the cost?                                                                                        | used / noticed / missed      |
| 10  | **Continuing**      | After the first level they could stop: do they play another one voluntarily? How many levels in ten minutes?                                                                               | continued / stopped          |
| 11  | **Feel**            | On a phone: does it feel native (no scroll, no zoom, no lag)? Any readability problem with cube size? Anything on the board too small to tap or read?                                      | good / issues                |
| 12  | **Their own words** | "What would you tell a friend about it?" "What was confusing?" "What would make you come back?"                                                                                            | verbatim                     |

Also note: device, browser, whether sound and haptics were on, and any crash or visual glitch.

## Findings

_None recorded yet: awaiting humans._

When sessions are done, add one section per tester here (T1, T2, ...) with the filled rows above,
then a summary: how many completed the tutorial and where the others got stuck, what was confusing,
what delighted, and every problem ranked by how many testers hit it. Only things people did or said
go in this document. Fixes that follow become new tasks in the M15 milestone.

## Also asked of whoever holds a phone (carried from M15.3, docs/QA.md "Not measured")

- **On-device frame rate** of `/play/?engine=v2&level=dense&profile=1` (steps in
  [V2_PERF.md](V2_PERF.md#real-device-measurement-not-done-tracked-as-m153-issue-103)); record device,
  browser and the numbers.
- Whether the booster tray's buttons (about 30 px tall) are comfortable to tap, and whether cubes are
  readable on the smallest phone in the session (cube size on short phones fell with the tray: QA.md).
- Touch feel, audio unlock and haptics on iOS Safari and Android Chrome.

## Decisions this round should inform

- Do the tutorial hints work for real first-time players, or does the wording need changing?
- Are tutorial-grade pictures (five of the six) acceptable as the daily and first content, or do
  they need the layered redesign first ([V2_PRODUCTION.md](V2_PRODUCTION.md))?
- Is the Undo price (one booster or 15 coins) and the starting kit felt as fair?
- Is the 2× rewarded-ad offer understood and acceptable, and does losing the free alternating 2× matter?
- Is the v2 game fun enough to replace v1 at M15.5?
