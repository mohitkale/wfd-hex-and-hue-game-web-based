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
phone-sized (390×800) pane on a desktop, **dev server (unminified)**, software-independent metric.

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
sideways so none hides another. All of it is a pure function of ids and cells, applied only when
drawing; the engine never sees it, so logical outcomes are identical with and without it (and at 1×
and 2×, because speed only changes the tick clock).

## What this does and does not show

- **Shows:** the renderer's CPU work per frame is small and bounded for the largest board and the
  most familiars the rules allow; the sprite pool is bounded; per-frame allocations were removed from
  the sprite loop; displayed counts equal the engine's.
- **Does not show:** frame rate on a phone. Desktop CPUs are typically 4–6× faster than a mid-range
  Android core, so about 2–6 ms here suggests roughly 10–30 ms there for the worst case: **median
  likely fine, p95 possibly near the 16.6 ms budget on the weakest devices**. GPU fill rate and memory
  are not measured here. This needs a real device (planned in M15.3); the profiler build is the tool.
- The `update` and submit numbers are desktop, dev-server, headless-capable, and change with
  hardware. The thresholds to hold on this machine going forward: **submit median ≤ 3 ms and p95
  ≤ 6 ms, `update` p95 ≤ 6 ms on the stress fixture.**
- Cells on a 40×40 board are only ~8 CSS px on a phone (readability is a M11.2 question, not a
  performance one).

## How to repeat

```js
// in the page console of a ?engine=v2&level=big&profile=1 build, after selecting groups
for (let c = 0; c < 5; c++) __collect.liveSession.tap({ kind: "select", column: c });
// wait ~15 s, then:
__collect.perf();
```

Keep the browser pane visible: a hidden page does not run animation frames at all.
