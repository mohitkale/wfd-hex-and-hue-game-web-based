/**
 * Cube size and play time per board size (docs/V2_ART_DENSITY.md).
 *
 *   npm run density
 *
 * Cube size comes from the real portrait layout on a phone matrix; play time from playing the
 * shaded test orb (always finishable) with an eager bot on the real engine at 24 ticks a second.
 */
import * as collect from "@hexhue/core/collect";
import { computeCollectLayout } from "../../packages/game/src/collect/collectLayout";
import { layeredOrb } from "../../packages/game/src/collect/denseBoard";

export const PHONES: [string, number, number, number][] = [
  ["iPhone SE (1st gen)", 320, 568, 2],
  ["Galaxy S (360×640)", 360, 640, 3],
  ["iPhone SE (2nd gen)", 375, 667, 2],
  ["iPhone 15", 393, 852, 3],
  ["Pixel 7", 412, 915, 2.625],
];
export const SIZES = [16, 24, 32, 36, 40];
export { TICKS_PER_SECOND } from "../../packages/core/src/collect/measures";
import { TICKS_PER_SECOND as TPS } from "../../packages/core/src/collect/measures";

/** CSS pixels per cube (cell pitch, gap included) for a `size`×`size` board on a phone. */
export function cubeCss(
  size: number,
  [, w, h, dpr]: [string, number, number, number],
  panels = { columns: 4, slots: 2, fieldCap: 3 },
): number {
  const l = computeCollectLayout({
    width: Math.round(w * dpr),
    height: Math.round(h * dpr),
    dpr,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    boardWidth: size,
    boardHeight: size,
    ...panels,
    portalX: Math.floor((size - 1) / 2),
    // The booster tray (M14.4) is on every non-tutorial level, so it takes board height too.
    tray: true,
  });
  return l.cell / dpr;
}

/** Plays the level with a bot that taps whenever something is legal; returns ticks and outcome. */
export function botPlay(level: collect.CollectLevel, eager: boolean) {
  const session = new collect.CollectSession(level);
  for (let guard = 0; session.state.status === "playing" && guard < 1_000_000; guard++) {
    const legal = collect.legalActions(session.state);
    if (legal.length > 0 && (eager || collect.isSettled(session.state))) {
      session.tap(legal.find((a) => a.kind === "resume") ?? legal[0]!);
    } else if (session.tick() === null && legal.length === 0) break;
  }
  return { status: session.state.status, ticks: session.state.tick };
}

if (process.argv[1]?.endsWith("density.ts")) {
  console.log("Cube pitch in CSS px (square board):");
  console.log(["device".padEnd(22), ...SIZES.map((s) => String(s).padStart(5))].join(""));
  for (const p of PHONES) {
    console.log(
      [p[0].padEnd(22), ...SIZES.map((s) => cubeCss(s, p).toFixed(1).padStart(5))].join(""),
    );
  }
  console.log("\nTest orb (6 colours, 4 shades each), play time at 1×:");
  console.log("size  cubes  eager bot   one group at a time");
  for (const size of SIZES) {
    const level = layeredOrb(size);
    const cubes = level.cells.filter((c) => c >= 0).length;
    const fast = botPlay(level, true);
    const slow = botPlay(level, false);
    const sec = (t: number) => `${(t / TPS).toFixed(0)} s`;
    console.log(
      `${String(size).padStart(4)}  ${String(cubes).padStart(5)}  ${fast.status} ${sec(fast.ticks).padStart(6)}   ${slow.status} ${sec(slow.ticks).padStart(6)}`,
    );
  }
}
