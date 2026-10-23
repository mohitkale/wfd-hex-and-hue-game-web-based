# Running the v2 review build

The v2 board is **not** part of the shipped game. It loads only when asked for, as a separate chunk,
so players of v1 see nothing different (see `docs/V2_PROTOTYPE_SPEC.md` §6).

```bash
npm install     # once
npm run dev     # Astro dev server, usually http://localhost:4321
```

Open one of:

| URL                               | What you get                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/play/?engine=v2`                | A first visit: the tutorial (`docs/V2_ONBOARDING.md`); after it or a skip: the slice, "Moonlit Hat" (`docs/V2_SLICE.md`) |
| `/play/?engine=v2&level=slice`    | The M10.5 vertical slice, "Moonlit Hat", always                                                                          |
| `/play/?engine=v2&level=moon`     | The crescent-moon dev level (20×18, five colours, 3 columns, 4 slots)                                                    |
| `/play/?engine=v2&level=parking`  | The teaching board from the design doc: park, resume, or lose with one slot                                              |
| `/play/?engine=v2&level=purple12` | Purple 12 can reach only 7 cubes: it waits showing 5 until the blue is cleared                                           |
| add `&cb=1`                       | Colour-blind symbols on familiars, carried cubes and groups                                                              |
| add `&speed=2`                    | Start at 2× (the 1×/2× button also toggles it; review builds only)                                                       |

A production build can include it permanently with `PUBLIC_ENGINE=v2 npm run build`.

## How to play

Tap the front group of a column: its familiars come out of the portal, walk to the nearest cube of
their colour they can reach, pick it up, carry it back and drop it in the portal. The number on a group
is how many cubes it can still deliver and drops only on delivery. A group that runs out of
reachable cubes waits in a holding slot (tap it later to resume). If a group runs dry while every slot
is full, or nothing left can reach the remaining cubes, you lose. ↶ undoes your last move, ⟲ restarts.

## Evidence from the M10.2 build (headless Chrome, 390×800 @2×)

| Screenshot                                               | Shows                                                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [board-moon.jpg](art/m10.2/board-moon.jpg)               | The crescent board with colour-blind symbols on the group badges                                                                   |
| [swarm-carrying.jpg](art/m10.2/swarm-carrying.jpg)       | Three gold familiars out; two carry a cube above their heads; the group is in the WORKING strip                                    |
| [swarm-two-groups.jpg](art/m10.2/swarm-two-groups.jpg)   | Two groups working at once (gold 8 left, purple 4 left), six familiars out, cubes carried overhead with their colour-blind symbols |
| [carry-and-working.jpg](art/m10.2/carry-and-working.jpg) | Teaching board: the red group working, a familiar carrying the cube into the portal                                                |
| [lose-slots-full.jpg](art/m10.2/lose-slots-full.jpg)     | The designed losing line: red parked in the only slot, green ran dry: "Out of slots"                                               |

Checked in the browser during review: over 240 consecutive frames of a two-group swarm, every on-screen group number equalled the engine's remaining capacity (2,160 comparisons, 0 differences).

Measured in that run (3 familiars on the moon board, dev server, headless): median frame 16.9 ms,
p95 33.8 ms, max 47 ms. **That is not a phone measurement**; mid-range device numbers are M10.3.

## Does shipping v2 code change the shipped game?

Not its bundle or its service worker. Experiment (a string inside the v2 scene changed, everything
rebuilt): `play*.js` and `sw.js` were byte-identical before and after, only `v2/CollectScene.js`
changed. The build fails if that property is lost (`tools/perf/check.ts`).

## Known rough edges (M10.3 and later)

A mid-range-device frame-time measurement (M15.3; desktop numbers are in `docs/V2_PERF.md`). Sound,
haptics, trails and completion effects arrived in M10.4 and have not been judged by a human yet (G1). With the maximum of 8 holding slots on a 320 px phone each slot is
narrower than the 44 px tap guideline; real levels use 3–5. The 1×/2× button and `&speed=2` exist
only in review builds and are removed or gated when the real 2× rule lands (M14.3).
