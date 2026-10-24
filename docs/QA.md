# Launch QA (v1.0.0)

Checked on 2026-10-23 against the production build (`npm run build`, served locally) and the dev
build (for in-game measurements). Re-run before each release.

## Lighthouse (mobile, simulated 4G)

| Page                 | Performance | Accessibility | Best practices | SEO |
| -------------------- | ----------- | ------------- | -------------- | --- |
| `/`                  | 100         | 100           | 100            | 100 |
| `/play/`             | 92          | 100           | 100            | 100 |
| `/spellbook/`        | 100         | 100           | 100            | 100 |
| `/blog/`             | 100         | 100           | 100            | 100 |
| `/blog/moon-phases/` | 100         | 100           | 100            | 100 |
| `/faq/`              | 100         | 100           | 100            | 100 |
| `/privacy/`          | 100         | 100           | 100            | 100 |

`/play/` LCP 0.9 s (the HTML splash paints while the game downloads); total blocking time 360 ms
from parsing the Phaser bundle (~385 KB gzip, the bulk of the 450 KB budget).

```bash
npx lighthouse@12.8.2 http://localhost:4321/play/ --chrome-flags="--headless=new" --view
```

## Device matrix (in a level, Zodiac Realm 11)

Sizes in CSS px. Every device: all controls on screen, board between the HUD and boosters, no
horizontal scroll.

| Device              | Viewport @ dpr | Tile | Column zone | Slot |
| ------------------- | -------------- | ---- | ----------- | ---- |
| iPhone SE (1st gen) | 320×568 @2     | 14.5 | 93×137      | 43   |
| iPhone SE (2nd gen) | 375×667 @2     | 17   | 109×160     | 50   |
| iPhone 15           | 393×852 @3     | 21   | 114×204     | 54   |
| Pixel 7             | 412×915 @2.625 | 22.1 | 120×210     | 54   |
| Galaxy S8           | 360×740 @3     | 19   | 103×178     | 54   |
| iPad                | 768×1024 @2    | 26   | 143×210     | 54   |
| iPad (landscape)    | 1024×768 @2    | 20.5 | 143×185     | 54   |
| Desktop             | 1440×900 @1    | 26   | 142×210     | 54   |
| Phone (landscape)   | 844×390 @3     | 9    | 149×94      | 32   |

Phone landscape is playable but small (portrait-first game): a short, non-blocking "best played
upright" hint appears there.

Emulated in headless Chrome. Still to do on real hardware before a big announcement: one iPhone
(Safari, installed to the home screen) and one mid-range Android (Chrome), for touch feel, audio
unlock, haptics and frame rate, and that pinch / double-tap never zooms the game page (including
over the consent and update banners).

## Bug bash

Played in headless Chrome at 2×: wins in all three worlds (Moonlit 5, Crystal 10, Zodiac 15) with
the win card and coins; a deliberate loss on Zodiac 20 showed the lose card and Retry reset the
board. No errors or unhandled rejections.

Fixed during QA:

- The game page painted nothing until the 385 KB bundle ran (blank screen on slow networks; no
  first contentful paint for Lighthouse): an HTML splash now shows at once and fades when the title
  screen is ready.
- `maximum-scale=1, user-scalable=no` on the game page failed accessibility; zoom on the canvas is
  prevented with `touch-action` instead.
- "2× free" was clipped at the right edge on 320 px phones: the speed button is right-aligned with
  a wider touch zone.
- The "+n" count of hidden wisps overlapped the third wisp in short columns: it sits beside it.

Also verified this milestone: offline play, the update toast and install flow (M6.4), the CSP on
every page with zero violations (M7.3), analytics consent end to end (M7.2), and the Docker image
smoke test in CI.

# v2 board QA (M15.3)

Checked on 2026-10-24 on `main` after M15.2. **No real phone, no Safari, no Firefox and no installed
PWA was available**; everything below is the desktop Claude app's browser pane (Chromium) emulating
a 390×800 phone at dpr 2 on the Astro dev server (unminified), plus Node. The on-device 60 fps
measurement that M11.2 and M10.3 deferred is **still not done**: see "Not measured".

## Frame cost (`?engine=v2&level=<id>&profile=1`)

CPU time per frame, not vsync-bound frame time (the pane's refresh is not reliable; see
[V2_PERF.md](V2_PERF.md)). Groups started at once, 8 s warm-up, 10 s sampled, ~550 frames each. The
sprite pool equalled the engine's familiar count (`countsMatch`) every time and never exceeded
`squad × fieldCap`.

| Level                          | Cubes | Familiars (peak / limit) | Submit median | Submit p95 | Submit max | `update` median | `update` p95 | `update` max |
| ------------------------------ | ----- | ------------------------ | ------------- | ---------- | ---------- | --------------- | ------------ | ------------ |
| `big` (40×40, stress)          | 1,600 | 30 / 36                  | 1.5 ms        | 3.1 ms     | 3.4 ms     | 0.3 ms          | 3.1 ms       | 7.9 ms       |
| `dense` (32×32 shaded orb)     | 772   | 20 / 20                  | 1.2 ms        | 2.7 ms     | 3.4 ms     | 0.2 ms          | 2.0 ms       | 8.7 ms       |
| `art-black-cat` (a real piece) | 575   | 12 / 12                  | 1.2 ms        | 2.3 ms     | 2.7 ms     | 0.1 ms          | 0.4 ms       | 3.2 ms       |

Against M10.3 (`big`: 1.5 / 3.7 ms) the M11–M14 additions (shading, seals, HUD, tray, boosters,
gameplay events) cost nothing measurable. These are desktop numbers: a phone core is slower by a
factor nobody here has measured, so **60 fps on a mid-range phone remains a hypothesis**.

## Engine cost (`npm run perf:engine`, Node, eager bot)

Pathfinding is not per frame: a route is found when a familiar gets a target and the distance map
is refreshed only when a cube is picked up. Per tick, on this machine:

| Level              | Cubes   | Ticks       | Mean           | p99            | Worst tick   |
| ------------------ | ------- | ----------- | -------------- | -------------- | ------------ |
| slice              | 196     | 212         | 0.008 ms       | 0.035 ms       | 0.05 ms      |
| the six art pieces | 312–575 | 1,162–2,636 | 0.001–0.004 ms | 0.005–0.019 ms | 0.03–0.64 ms |
| `dense`            | 772     | 2,156       | 0.003 ms       | 0.006 ms       | 1.1 ms       |
| `big`              | 1,600   | 3,211       | 0.004 ms       | 0.008 ms       | 0.56 ms      |

At 24 ticks a second (48 at 2×) the engine is a rounding error next to rendering, even at a 100×
slower phone.

## Downloads (`npm run budget`, production build)

| Item                                  | Size          | Budget                                                                                      |
| ------------------------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| Play page JS (Phaser and v1 game)     | 392.5 KB gzip | 450 KB                                                                                      |
| v2 board chunk (`v2/CollectScene.js`) | 40.1 KB gzip  | **43 KB** (raised from 40 in M14.5; the tutorial, boosters, daily and events took it to 40) |
| Whole build                           | 2,471 KB      | 3,072 KB                                                                                    |

The CI perf budget was updated for v2 in M14.5 (40 → 43 KB for the chunk) and needed nothing more here.
The v2 chunk loads only with `?engine=v2` today; at the M15.5 switch it becomes part of the shell and
the 450 KB play-page budget must be re-set with it (the sum is about 433 KB gzip).

## Layout and cube size

The layout matrix ([V2_INTERFACE.md](V2_INTERFACE.md)) and the density tool
([V2_ART_DENSITY.md](V2_ART_DENSITY.md)) now include the 30 CSS px booster tray under the HUD. **A
finding from this work:** the tray was added in M14.4 without re-running them, and on the shortest
phones it made cubes smaller than the M11.2 floors (iPhone SE 1st gen 32 per side: 8.0 px against
8.5; Galaxy S 40 per side: 7.7 against 8). The tray was slimmed (34 → 30 px, no extra gap) and the floors
were lowered to what the layout now achieves (6.5 / 7.5 / 8, was 7 / 8 / 8.5; no shipped piece is
over 32 high, the widest is 40 by 20). Phones 852 px tall and up are unaffected. If readability on a
small phone is a problem at G3, the next lever is hiding the tray on short phones.

## Compatibility

| Area                                                                     | Status                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chromium (this pane, emulating Android Chrome's UA and a 390×800 screen) | Plays, measured above; the only console error was a dev-server 404 for `sw.js` / `favicon.ico` (the service worker exists only in production builds)                                                                                                                                                                                                                                 |
| Mobile Safari, Android Chrome on a device, Firefox, Safari desktop       | **Not tested**                                                                                                                                                                                                                                                                                                                                                                       |
| Installed PWA, offline                                                   | **Not tested on a real install.** In the M15.5 release candidate the v2 chunk is a hashed bundle in `_astro/`, so it is part of the precached shell (a unit test pins this); whether a real installed PWA then plays v2 offline is still to be checked                                                                                                                               |
| Reduced motion                                                           | Implemented on the v2 board (no trails, sparks, fountains or squash; stationary completion; motes still) and unit-tested (`ambient`, `completion`, `feedback`); not re-checked by eye in this pass                                                                                                                                                                                   |
| Colour-blind mode                                                        | Checked by eye (`?cb=1`): a symbol on every familiar and every group badge. **Cubes on the board carry no symbol**; matching is by colour there, with the badge symbols as the key                                                                                                                                                                                                   |
| Sound and haptics                                                        | The v2 board honours the saved sound and haptics settings. **A Menu button in the v2 tray now opens a settings panel over the board (sound, music, vibration, colour symbols, reduced motion, and the anonymous-stats choice where analytics exist); the game waits while it is open and the level is kept. Volume sliders are not in it (on/off only); they stay in the v1 settings |
| Touch targets                                                            | HUD buttons are 44 css px zones; the tray pills are drawn about 30 px tall, but each has a 44 px-tall tap zone (since M15.x)                                                                                                                                                                                                                                                         |

## Not measured (carried into M15.5 / G3)

1. **On-device frame rate**, including the 32×32 `dense` board: needs a person with a reference phone
   (steps in [V2_PERF.md](V2_PERF.md#real-device-measurement-not-done-tracked-as-m153-issue-103);
   `?engine=v2&level=dense&profile=1`). **Open.**
2. GPU time and memory on a tile-based mobile GPU (the static layer is a ~12 MB texture at dpr 3).
3. WebGL context loss on a real device (verified only with `WEBGL_lose_context` on desktop).
4. Real touch feel, audio unlock and haptics on iOS and Android.
5. Offline play of v2 from an installed PWA (precached in the RC; unverified on a device).
