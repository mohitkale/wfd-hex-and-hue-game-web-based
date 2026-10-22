import { describe, expect, it } from "vitest";
import { createState, launch, runQuiet, type LaunchSource, type SimState } from "@hexhue/core";
import { hintMove } from "./hint";
import { worlds } from "./levels";

/** Plays a level by always following the hint; returns the final state. */
function playByHints(state: SimState): { state: SimState; misses: number } {
  let misses = 0;
  while (state.status === "playing") {
    const move: LaunchSource | null = hintMove(state);
    if (!move) {
      misses++;
      break;
    }
    launch(state, move);
    runQuiet(state);
  }
  return { state, misses };
}

describe("idle hints", () => {
  // Hundreds of real solver runs: ~3 s alone, longer when the whole suite runs in parallel.
  it("lead every shipped level to a win within the hint budget", () => {
    for (const world of worlds) {
      for (const built of world.levels) {
        const { state, misses } = playByHints(createState(built.level));
        expect(misses, built.level.id).toBe(0);
        expect(state.status, built.level.id).toBe("won");
      }
    }
  }, 30_000);

  it("give no hint while wisps move, after the game ends, or from a dead end", () => {
    const level = worlds[0]!.levels[0]!.level;
    const moving = createState(level);
    launch(moving, hintMove(moving)!);
    expect(moving.track.length).toBe(1);
    expect(hintMove(moving)).toBeNull();

    const lost = createState(level);
    lost.status = "lost";
    expect(hintMove(lost)).toBeNull();

    // Fragments left but no wisps to collect them: nothing keeps this board winnable.
    const stuck = createState(level);
    stuck.columns = stuck.columns.map(() => []);
    expect(hintMove(stuck)).toBeNull();
  });

  it("give no hint when the search budget runs out", () => {
    // Any board needing several launches can't be solved by expanding a single state.
    const level = worlds[2]!.levels[10]!;
    expect(level.solution.length).toBeGreaterThan(1);
    expect(hintMove(createState(level.level), 1)).toBeNull();
  });
});
