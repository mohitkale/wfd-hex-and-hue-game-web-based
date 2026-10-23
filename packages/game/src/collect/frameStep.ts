import type * as collect from "@hexhue/core/collect";
import type { TickClock } from "./tickClock";

/**
 * One frame of the v2 board's time (M14.3): feeds the frame's time to the clock at the chosen speed and
 * runs the ticks that are due. The scene and the speed tests both use it, so the test exercises the
 * loop the game really runs. Returns how many ticks were due.
 *
 * - `paused` (an ad is on screen) runs nothing and lets no time build up;
 * - when nothing is ticking (settled or over) the backlog is dropped, keeping the position inside the
 *   current tick so familiars never snap back.
 */
export function stepFrame(
  session: collect.CollectSession,
  clock: TickClock,
  deltaMs: number,
  speed: number,
  paused = false,
): number {
  if (paused) return 0;
  const due = clock.advance(deltaMs, speed);
  for (let i = 0; i < due; i++) {
    if (session.tick() === null) {
      clock.drain();
      break;
    }
  }
  if (due === 0 && session.state.status !== "playing") clock.drain();
  return due;
}
