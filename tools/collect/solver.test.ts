import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { report } from "./solverReport";
import { ART_LEVELS } from "../../packages/game/src/collect/artLevels";
import { LOSE_LINES, moonlitHat } from "../../packages/game/src/collect/slice";

/** The solver on the real levels: the slice and every art preview level (M12.1). */

const levels = () => [moonlitHat(), ...Object.values(ART_LEVELS).map((make) => make())];

describe("the solver on the shipped review levels", () => {
  it.each(levels().map((l) => [l.id, l] as const))(
    "%s: solved, the line replays to a win, and so does the fewest-slots line",
    (_id, level) => {
      const result = new collect.CollectSolver(200_000).solve(level);
      expect(result.status).toBe("solved");
      const won = collect.replayLine(level, result.line!);
      expect(won.state.status).toBe("won");
      expect(won.state.deliveredTotal).toBe(won.state.cubesTotal);
      const fewest = collect.minSlots(level, 200_000);
      expect(fewest.unknown).toBe(false);
      expect(fewest.slots).not.toBeNull();
      const withFewest = { ...level, slots: fewest.slots! };
      expect(collect.replayLine(withFewest, fewest.line!).state.status).toBe("won");
    },
  );

  it("agrees with the recorded losing lines of the slice: from the position they reach, nothing wins", () => {
    const level = moonlitHat();
    for (const line of Object.values(LOSE_LINES)) {
      const session = collect.replayLine(level, line);
      expect(session.state.status).toBe("lost");
      expect(new collect.CollectSolver().solveState(session.state).status).toBe("unsolvable");
    }
  });

  it("the report table covers every level and is deterministic", () => {
    const rows = report(50_000);
    expect(rows.map((r) => r.id)).toEqual(levels().map((l) => l.id));
    expect(rows.every((r) => r.status === "solved")).toBe(true);
    expect(report(50_000).map((r) => [r.id, r.status, r.nodes, r.minSlots])).toEqual(
      rows.map((r) => [r.id, r.status, r.nodes, r.minSlots]),
    );
  });
});
