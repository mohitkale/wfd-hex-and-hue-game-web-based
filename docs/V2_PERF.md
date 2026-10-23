# v2 board performance (M10.3)

How the v2 board's rendering cost was measured, what changed because of it, and what is **not**
proven. Numbers are from the review build; "mid-range phone" figures are estimates until a device is
measured.

## What is measured

`?engine=v2&level=big&profile=1` turns on a profiler (`CollectScene.perf()`, also reachable as
`window.__collect.perf()` in that build):

| Metric                                           | Meaning                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `updateMs*`                                      | CPU time of the scene's own `update` per frame: ticks, interpolation, sprite placement, cube edits |
| `renderSubmitMs*`                                | CPU time Phaser spends submitting a frame (between its `prerender` and `postrender` events)        |
| `familiarsLive/Drawn`                            | Engine familiars versus sprites drawn: must be equal (`countsMatch`)                               |
| `spritesCreated`, `peakFamiliars`, `maxPossible` | Pool check: sprites ever created must not exceed `squad × fieldCap`                                |
| `cubeClears/Flushes`                             | Cube-texture edits queued and applied                                                              |

Frame time from `requestAnimationFrame` is **not** used for comparisons: it follows vsync, and the
in-app browser pane's refresh varied between 17 and 50 ms median during this work, even when idle. CPU
submit time does not.

**Stress fixture:** `level=big`: a 40×40 board (the engine's size limit, 1,600 cubes), five groups
at once, squad 6, so 30 familiars on screen (limit 36), all carrying, delivering and spawning. Run in a
phone-sized (390×800) pane on a desktop, **dev server (unminified)**, using a metric that does not depend on vsync.

## Result

| Version                                                    | Idle submit | Loaded submit median | p95        | max        |
| ---------------------------------------------------------- | ----------- | -------------------- | ---------- | ---------- |
| M10.2: Graphics for cubes, rounded-rect badges and HUD     | 6.2 ms      | 11.7 ms              | 15.1 ms    | 34.8 ms    |
| Cubes in a RenderTexture, everything else as before        | 6.2 ms      | 7.8 ms               | 11.2 ms    | 42.1 ms    |
| **+ baked static layer and badge textures, image shadows** | **0.5 ms**  | **1.5 ms**           | **3.7 ms** | **4.6 ms** |

Scene `update` stayed at median 0.1–1.1 ms, p95 2.5–5.5 ms throughout. Sprite pool: 30 created, 30
peak, limit 36. On-screen counts equal the engine's (`countsMatch`).

For reference the v1 title screen submits in 0.2 ms.

## What changed because of it

Bisecting (hiding one kind of object at a time) showed Phaser **re-tessellates every Graphics
object's rounded rectangles, ellipses and circles on every frame**: 12 group badges cost about 4 ms,
the static board/HUD Graphics about 2 ms, and the 1,600-cube Graphics about 5 ms. So:

- Cubes are painted once into a `RenderTexture`; a pickup clears that cube's cell and the edits are
  flushed once per frame (`CubeLayer`).
- The board panel, field/slot outlines and HUD button circles are baked into one static
  `RenderTexture` (`CollectScene.bakeStaticLayer`); badge backgrounds and the portal gate are baked
  textures (`bake.ts`).
- Shadows are tinted `glow` images, carried cubes are baked per-colour images (the ellipse _shape_
  was also being rebuilt every frame).

## Swarm behaviour (cosmetic only)

`swarm.ts`: every familiar keeps a small fixed drift off its cell centre (≤ 0.16 cell), its own
hover phase and rate, and its own pop-in length (120–170 ms); familiars drawn on one cell fan out
sideways so they overlap less (it reduces exact stacking; sprites are wider than a cell, so crowded cells still overlap), and the crowd offset glides rather than snapping. All of it is a pure function of ids and cells, applied only when
drawing; the engine never sees it, so logical outcomes are identical with and without it (and at 1×
and 2×, because speed only changes the tick clock).

## What this does and does not show

- **Shows:** on the largest board and the most familiars the rules allow, the renderer's CPU work per
  frame is small and bounded on a desktop; the sprite pool is bounded (30 created, 30 peak, limit 36);
  the sprite loop does not allocate per frame (per-familiar constants are cached; a few small
  iterators and map writes remain); the number of sprites on screen, counted by the layer itself,
  equals the engine's familiar count.
- **Does not show: frame rate on a phone.** The two CPU costs that share a frame are the scene's
  `update` and Phaser's frame submit. On the stress fixture those were (desktop, loaded) about
  **1 ms + 1.5 ms at the median and up to 5.5 ms + 3.7 ms at p95**. A phone core is slower by an
  unmeasured factor (commonly quoted as several times; there is no source for a specific number here).
  Adding the two and multiplying by that factor gives a median of a few to ~15 ms and a p95 that
  could exceed the 16.6 ms budget on weak devices. **So "fine on a mid-range phone" is not
  established; it is a hypothesis for M15.3 to test.**
- **GPU is not measured.** This PR trades many small draw commands for a few large textures: a
  full-width alpha-blended quad for the static layer (HUD, board, outlines, cropped to the area above
  the columns) and a cube texture covering the mosaic. On a tile-based mobile GPU, fill rate and
  memory could matter more than CPU submit. Rough memory (computed from the layout): the static layer
  is at most ~480 css px wide × ~75 % of the screen height, i.e. about 12 MB at dpr 3, plus the cube
  texture (up to ~7 MB for a full-width board). Both are re-created on resize.
- **Context loss:** render textures keep their pixels in GPU memory and are not restored by the
  browser after a WebGL context loss; the scene redraws everything from the session state on
  Phaser's `RESTORE_WEBGL` event. This is implemented and was exercised in the desktop browser with the `WEBGL_lose_context` extension: **with** the handler the board redraws from the session; with it removed (control run) the board stays blank (no cubes, panel, outlines or HUD circles) while familiars walk over nothing. A real-device check is still part of M15.3.
- **The environment:** a Mac desktop running the in-app browser pane at 390×800, Astro **dev server**
  (unminified), WebGL. The `max` values are single outliers, not evidence. No thresholds are
  enforced in CI; on this setup the numbers to watch for regression are **submit median ≤ 3 ms, p95
  ≤ 6 ms and `update` p95 ≤ 6 ms** on the stress fixture, as a manual check only.
- Cells on a 40×40 board are only ~8 CSS px on a phone (readability is an M11.2 question).

## Real-device measurement (not done; tracked as M15.3, issue #103)

Issue #77 asked for an early mid-range Android measurement. The author has no device, so it is
**deferred** to M15.3 rather than claimed. To do it:

1. Build a profiler-capable production bundle: `PUBLIC_ENGINE=v2 npm run build`, serve `apps/web/dist`
   over HTTPS or on the LAN, open `/play/?engine=v2&level=big&profile=1` on the phone (this puts
   `window.__collect` on the page in that build).
2. Attach remote debugging (`chrome://inspect` for Android Chrome, Web Inspector for iOS Safari).
3. In the console, select five groups (`for (let c = 0; c < 5; c++) __collect.liveSession.tap({kind:
"select", column: c})`), wait for the swarm to build up (~8 s), call `__collect.resetProfile()`,
   wait ~10 s, then read `__collect.perf()`.
4. Record the device, browser and version, `updateMs*`, `renderSubmitMs*`, `countsMatch`, plus a
   Chrome performance trace for GPU time.

Keep the page visible while measuring: a hidden page does not run animation frames at all.

## M10.4 effects (trails, sparks, blooms, motes)

All decorative particles live in one fixed ring buffer (160 entries, `particles.ts`) drawn by a fixed
pool of 160 additive glow images (`ParticleLayer.ts`): a busy board recycles the oldest particle and
never allocates per frame or grows. The 14 background motes are placed from a pure function of time.
Trails are only left by carrying familiars (at most one puff per carrier every 1.5 ticks); sparks and
blooms come from deliveries and completions. Lifetimes are counted in ticks, so 2× plays the same
show in half the milliseconds. Reduced motion emits no trails, sparks or fountains and keeps the
motes still; a completion is a short stationary fade of light.

Measured on the desktop dev server (`?profile=1&level=big`, 18 familiars out, up to 70 live
particles): scene `update` median 0.3 ms / p95 2.4 ms, frame-submit median 0.7 ms / p95 1.4 ms. As
before, this is desktop CPU only and says nothing about a phone's frame rate (see M15.3).
