# Hex & Hue: Magic Pixel Puzzle — Game Design Spec

_A Little Magic in Every Color._

This is the source of truth for gameplay rules. The engine (`packages/core`) must implement exactly
these rules, deterministically, so the solver and the player see the same game.

## 1. Core loop (track-around model)

```
          ← ← ← ← ← ← ← ← ← ←          top lane (moves left)
        ↓ ┌───────────────────┐ ↑
        ↓ │                   │ ↑      left lane moves down,
        ↓ │   PIXEL  MOSAIC   │ ↑      right lane moves up
        ↓ │   (fragments)     │ ↑
        ↓ └───────────────────┘ ↑
          → → → → → → → → → →          bottom lane (moves right)
        ▲ entry                portal ✦
  ┌──────────── holding slots (K) ────────────┐
  │  [ 7🟣 ] [    ] [    ] [    ] [    ]       │
  └───────────────────────────────────────────┘
  summon columns:   [12🟣] [ 8🔵] [20🟡]        ← only the front of each column is tappable
                    [ 6🔵] [14🟣] [ 5🔴]
                    [ .. ] [ .. ] [ .. ]
```

| Term          | Rule                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Mosaic        | `W×H` grid. Each cell is empty or holds one **fragment** of a palette color.                                             |
| Wisp          | Has a `color` and a `charge` (the number shown). Collects fragments of its own color only.                               |
| Summon column | Stack of wisps. Only the front wisp of each column can be tapped.                                                        |
| Track         | Loop one cell outside the mosaic: right along the bottom, up, left along the top, down. Entry is the bottom-left corner. |
| Track cap     | At most `T` wisps on the track at once (level parameter, default 5).                                                     |
| Holding slots | `K` slots (default 5). A wisp that finishes a lap with charge left parks here.                                           |
| Portal        | A wisp whose charge reaches 0 flies to the portal immediately and leaves play.                                           |

### Movement and collection

- The simulation runs in discrete **steps**. Each step every wisp on the track advances one track cell.
- At its new track cell a wisp **looks inward** along its row (left/right lanes) or column (top/bottom
  lanes) and finds the **first non-empty fragment** in that line of sight.
- If that fragment's color equals the wisp's color, the wisp collects it: fragment removed, charge −1.
  At most **one** collection per wisp per step.
- Corner cells have no line of sight.
- Wisps are processed in track order (front-most first), so two wisps cannot collect the same fragment.
- After a full lap (back at the entry) a wisp with charge > 0 moves to the first free holding slot.

### Player actions

1. Tap the front wisp of a summon column → it enters the track (if the entry cell is free and `T`
   isn't reached; otherwise the tap is queued visually and launches as soon as possible).
2. Tap a wisp in a holding slot → it re-enters the track the same way.
3. Use a booster (see §4).

There is **no timer**. The player may wait as long as they like between taps.

### Win / lose

- **Win**: every fragment is collected (all wisps will have charge 0 by construction).
- **Lose**: a wisp finishes a lap with charge > 0 and all `K` holding slots are full.
- Invariant enforced at level build time: for every color, `sum(wisp charges) == fragment count`.

### Solvability guarantee

Because the player can always wait, a level is valid if a winning strategy exists that launches wisps
**one at a time** (each finishes its lap before the next launch). The solver searches that space; any
level shipped must have a solver-verified solution stored with it. Random generation must never
produce an unwinnable board.

## 2. Difficulty levers

Number of colors · mosaic size · layering (colors hidden behind other colors) · charge chunking
(many small wisps vs. few large) · column ordering (good wisps buried behind bad ones) · fewer holding
slots `K` · smaller track cap `T`. **Never** a countdown timer, never artificially slow movement.

Difficulty score (from solver): fraction of launch orders that lose, branching dead-ends, minimum
slot usage required. Level curves are tuned on this score.

## 3. Speed

- 1× is always available, free, forever.
- 2× applies for the rest of the current level. Unlock policy alternates: **free → rewarded ad →
  free → rewarded ad …** (counter persisted per player).
- On an "ad" turn with no ad available (no provider, no fill, ad error), the level stays at 1× and the
  counter still advances so the next level's 2× is free. The player is never blocked.

## 4. Boosters (MVP)

| Booster    | Effect                                                   | How to get                |
| ---------- | -------------------------------------------------------- | ------------------------- |
| Undo       | Revert to before the last launch                         | Coins or rewarded ad      |
| Shuffle    | Re-order wisps within summon columns (keeps it solvable) | Coins                     |
| Extra Slot | +1 holding slot for this level                           | Rewarded ad or consumable |
| Magic Wand | Collect every exposed fragment of one chosen color       | Coins or consumable       |

On a loss the player is offered **Revive** (Extra Slot) or **Retry**. Retry is always free and instant.

## 5. Progression & meta

- Worlds of ~20 levels. MVP: **Moonlit Beginnings**, **Crystal Garden**, **Zodiac Realm**.
- Each cleared mosaic reveals its illustration with a short lore card (moon phase meaning, crystal
  correspondence, zodiac trait…) and adds it to the **Spellbook**.
- Coins: earned per level (bonus for no boosters), ×2 via optional rewarded ad.
- No lives, no energy, no paywalled levels, no forced ads. Interstitials are off for MVP and, if ever
  enabled, never appear before a retry or during the first 10 levels.

## 6. Native-feel requirements

Portrait-first, full-bleed canvas with safe-area insets · no page scroll/bounce/zoom · touch response
in the same frame · haptics (`navigator.vibrate`) on tap/collect/win · 60 fps on mid-range phones ·
first playable frame < 2 s on 4G · offline-capable installable PWA · audio unlocked on first tap ·
colorblind mode (symbol per color) · one-handed thumb-zone controls.

## 7. Original content rule

Mechanics are inspired by the reference game / Pixel Flow genre; all art, characters, names, UI and audio are
original to Hex & Hue.
