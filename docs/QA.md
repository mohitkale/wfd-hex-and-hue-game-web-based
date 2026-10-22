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
