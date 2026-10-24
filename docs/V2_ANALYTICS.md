# v2 gameplay analytics (M14.5)

Anonymous, consent-gated events that say where v2 levels are too hard, too easy or abandoned. Code:
`packages/game/src/collect/gameplayTracker.ts` (what is counted), `packages/game/src/analytics/`
(consent, provider interface, PostHog adapter: unchanged), wired in `CollectScene`.

## Rules

- **Nothing is sent without consent.** Events go through the same provider-agnostic
  `AnalyticsProvider` as v1; the provider drops every event (and deletes the anonymous id) unless
  consent is `granted`. A browser privacy signal (GPC / Do Not Track) is a standing no. With no
  provider key configured the provider is a no-op. Tested end to end for the v2 events.
- **The engine never imports a vendor SDK.** `core` knows nothing of analytics; the game talks to the
  interface; PostHog is a plain HTTP adapter.
- **No PII.** Properties are level ids, counts, whole seconds, flags and fixed choices; a test
  rejects any property outside the documented list or of another type. The random id exists only
  after consent and no profile or location is requested.
- Analytics can never affect play: `track` swallows errors, the tracker only counts.

## Events

| Event                  | When                                                     | Properties                                               |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `play_start`           | level opened, and after each Retry                       | `level`, `kind` (tutorial/daily/picture/other), `replay` |
| `play_first_move`      | first accepted summon/resume of an attempt               | `level`, `seconds`                                       |
| `play_win`             | every cube delivered                                     | `level`, `seconds`, `moves`, `undos`, `boosters`         |
| `play_loss`            | `slotsFull` or `deadlock`                                | `level`, `seconds`, `moves`, `reason`                    |
| `play_retry`           | Retry pressed                                            | `level`, `after` (playing/won/lost), `seconds`           |
| `play_abandon`         | an unfinished attempt is left (next level, page closing) | `level`, `seconds`, `moves`                              |
| `play_undo`            | Undo used                                                | `level`, `paid` (owned/coins/free)                       |
| `play_booster`         | Extra Slot or Hint used (hint usage = `booster: "hint"`) | `level`, `booster`, `paid`                               |
| `play_ad_offer`        | once per level: could the optional 2× ad be offered      | `level`, `placement`, `available`                        |
| `ad_result` (existing) | the 2× ad ended                                          | `placement: "speed2x"`, `result`                         |

`seconds` is **active play only**: it stops during an ad wait, on an end card and while the tab is
hidden. A lost attempt continued by Undo or Extra Slot is reopened, so its eventual `play_win`
still counts (it follows a `play_loss`, with `undos`/`boosters` > 0).

## Reading them (aggregated metrics notes)

- **Funnel per level:** `play_start` → `play_first_move` → `play_win`. A big start-to-first-move gap
  means the opening is confusing; first-move-to-win drop-off is difficulty.
- **Too hard:** high loss share, `play_retry` with `after: "lost"` repeated, `play_abandon` after a loss,
  many `play_undo` / `hint` per win.
- **Too easy:** wins with few seconds, 0 undos and 0 moves beyond the minimum.
- **Where players stop:** `play_abandon.seconds` and `.moves`.
- **Ads:** `available` rate vs `ad_result.result`; the game never waits on either.
- Compare by `kind` so tutorial and daily numbers do not blur the picture levels. Counts only: there
  are no per-player timelines (no person profiles).

## Not done here

- No dashboard is built; PostHog (already the configured provider) aggregates by event and property.
- The first-time-player findings for M15.4 are human evidence; these events complement them, never
  replace them.
