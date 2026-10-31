import { describe, expect, it } from "vitest";
import { explain, explainTap, type Action } from "./actions";
import { addSlot } from "./boosters";
import { board, fixtureB } from "./fixtures";
import { parseCollectLevel, validateCollectLevel, type CollectLevel } from "./level";
import { CollectSession } from "./session";
import { solve } from "./solver";
import { createCollectState } from "./state";
import { violation } from "./invariants";

const select = (column: number): Action => ({ kind: "select", column });
const settle = (s: CollectSession) => {
  for (let i = 0; i < 20_000 && s.tick() !== null; i++) {
    /* run */
  }
};
/** Fixture B (a red and a green pocket inside blue) with `trays` shared trays. */
const shared = (trays: number): CollectLevel => ({
  ...fixtureB(),
  slots: trays,
  fieldCap: trays,
  sharedTrays: true,
});

describe("shared trays: every tray works (M15.13)", () => {
  it("the original rule loses with every slot full; shared trays keep the stuck boxes waiting", () => {
    // Red and green each have a cube walled in by blue. Under the original rule the second one runs dry with the
    // only slot taken and the game is lost.
    const old = new CollectSession({ ...fixtureB(), slots: 1 }, undefined, undefined, true);
    old.tap(select(0));
    old.tap(select(1));
    settle(old);
    expect(old.state.status).toBe("lost");
    expect(old.state.lossReason).toBe("slotsFull");

    // Three shared trays: red and green wait in theirs, blue works in the third, clears the walls,
    // and the waiting boxes go back to work by themselves.
    const s = new CollectSession(shared(3), undefined, undefined, true);
    expect(s.tap(select(0)).ok).toBe(true);
    expect(s.tap(select(1)).ok).toBe(true);
    expect(s.tap(select(2)).ok).toBe(true);
    settle(s);
    expect(s.state.status).toBe("won");
  });

  it("every occupied tray can work at once", () => {
    const s = new CollectSession(shared(3), undefined, undefined, true);
    s.tap(select(2)); // blue works
    const state = s.state;
    // Blue holds one tray; two are free, so both remaining columns can still be tapped.
    expect(explain(state, select(0))).not.toBe("fieldFull");
    expect(explainTap(state, select(0))).toBe("ok");
    expect(explainTap(state, select(1))).toBe("ok");
  });

  it("a new box needs a free tray; with every tray taken and every box stuck it is a deadlock", () => {
    const s = new CollectSession(shared(2), undefined, undefined, true);
    s.tap(select(0));
    s.tap(select(1));
    settle(s);
    // Red and green take the cubes on the edge, then wait for the walled-in ones in both trays: blue
    // cannot come out, so nothing can work.
    expect(s.state.status).toBe("lost");
    expect(s.state.lossReason).toBe("deadlock");
  });

  it("a full set of trays refuses the tap as busy", () => {
    const s = createCollectState(shared(1));
    s.groups[2]!.status = "working";
    s.columns[2]!.shift();
    expect(explain(s, select(0))).toBe("fieldFull");
    expect(explainTap(s, select(0))).toBe("fieldFull");
  });

  it("never loses with slotsFull, whatever the order of taps", () => {
    for (const order of [
      [0, 1, 2],
      [1, 0, 2],
      [2, 0, 1],
      [2, 1, 0],
    ]) {
      const s = new CollectSession(shared(3), undefined, undefined, true);
      for (const c of order) {
        s.tap(select(c));
        settle(s);
      }
      expect(s.state.lossReason).not.toBe("slotsFull");
    }
  });

  it("Extra Slot adds a tray that works like the others", () => {
    const s = createCollectState(shared(2));
    addSlot(s);
    expect(s.params.slots).toBe(3);
    expect(s.params.fieldCap).toBe(3);
    const session = new CollectSession(shared(2), undefined, undefined, true);
    session.tap(select(0));
    expect(session.addSlot()).toBe(true);
    session.undo();
    // The tray survives Undo, and is a working one.
    expect(session.state.params.fieldCap).toBe(3);
  });

  it("the solver plays by the shared rule", () => {
    expect(solve(shared(3)).status).toBe("solved");
    expect(solve(shared(1)).status).toBe("solved");
  });

  it("is validated and parsed", () => {
    expect(validateCollectLevel(shared(3))).toEqual([]);
    expect(validateCollectLevel({ ...shared(3), fieldCap: 2 })).toContain(
      "with sharedTrays, fieldCap must equal slots (every tray works)",
    );
    const parsed = parseCollectLevel(JSON.parse(JSON.stringify(shared(3))));
    expect(parsed.sharedTrays).toBe(true);
    expect(createCollectState(parsed).params.sharedTrays).toBe(true);
    expect(createCollectState(fixtureB()).params.sharedTrays).toBeUndefined();
  });
});

describe("Extra Slot after a shared-tray deadlock (M15.13)", () => {
  it("revives the game when a column still holds a box that could work", () => {
    const s = new CollectSession(shared(2), undefined, undefined, true);
    s.tap(select(0));
    s.tap(select(1));
    settle(s);
    expect(s.state.lossReason).toBe("deadlock");
    // Blue is still in its column: a third tray lets it out.
    expect(s.canAddSlot).toBe(true);
    expect(s.addSlot()).toBe(true);
    expect(s.state.status).toBe("playing");
    expect(s.tap(select(2)).ok).toBe(true);
    settle(s);
    expect(s.state.status).toBe("won");
  });

  it("is refused when a new tray would not help", () => {
    const s = createCollectState(shared(3));
    s.status = "lost";
    s.lossReason = "deadlock";
    s.columns = s.columns.map(() => []);
    expect(addSlot(s)).toEqual([]);
    // The original rule never revives a deadlock.
    const old = createCollectState(fixtureB());
    old.status = "lost";
    old.lossReason = "deadlock";
    expect(addSlot(old)).toEqual([]);
  });
});

describe("one cube per familiar, and the tray frees when the last one is out (M15.13)", () => {
  it("every familiar carries exactly one cube to the hole, then is gone", () => {
    const s = new CollectSession(shared(3), undefined, undefined, true);
    const delivered = new Map<number, number>();
    s.subscribe((b) => {
      for (const e of b.events)
        if (e.type === "cubeDelivered")
          delivered.set(e.familiar, (delivered.get(e.familiar) ?? 0) + 1);
    });
    for (const c of [0, 1, 2]) s.tap(select(c));
    settle(s);
    expect(s.state.status).toBe("won");
    expect([...delivered.values()].every((n) => n === 1)).toBe(true);
  });

  it("a box whose familiars are all out no longer holds a tray", () => {
    const level = {
      ...board(["RRRR"], [[["R", 2]], [["R", 2]]], {
        colors: "R",
        slots: 1,
        fieldCap: 1,
        spawnGap: 1,
      }),
      sharedTrays: true,
    };
    const s = new CollectSession(level, undefined, undefined, true);
    s.tap(select(0)); // two cubes' worth, in the only tray
    expect(explain(s.state, select(1))).toBe("fieldFull");
    // Tick until both red familiars have left the tray (none left inside).
    for (let i = 0; i < 50; i++) {
      const g = s.state.groups[0]!;
      if (g.capacity - g.delivered - g.committed === 0) break;
      s.tick();
    }
    expect(s.state.groups[0]!.status).toBe("working");
    expect(explain(s.state, select(1))).not.toBe("fieldFull");
  });
});

describe("the gate: ticks at the portal end of every trip (M15.13)", () => {
  it("adds `gate` portal steps to each route and still wins the same board", () => {
    const level = { ...shared(3), gate: 4 };
    expect(validateCollectLevel(level)).toEqual([]);
    const s = new CollectSession(level, undefined, undefined, true);
    s.tap(select(2));
    s.tick();
    const f = s.state.familiars[0]!;
    expect(f.route.slice(0, 5)).toEqual(new Array(5).fill(s.state.params.portal));
    for (const c of [0, 1]) s.tap(select(c));
    settle(s);
    expect(s.state.status).toBe("won");
    expect(validateCollectLevel({ ...level, gate: -1 })).toContain(
      "gate must be an integer in 0..40",
    );
  });
});

describe("edge gate: in and out anywhere along the bottom edge (M15.13)", () => {
  const edged = (): CollectLevel => ({ ...shared(3), gate: 2, edgeGate: true });

  it("routes start at the bottom-row cell nearest the cube, not all at the portal", () => {
    const s = new CollectSession(edged(), undefined, undefined, true);
    for (const c of [0, 1, 2]) s.tap(select(c));
    const starts = new Set<number>();
    for (let i = 0; i < 60 && s.state.status === "playing"; i++) {
      for (const f of s.state.familiars) starts.add(f.route[0]!);
      if (s.tick() === null) break;
    }
    const { stride, height, portal } = s.state.params;
    const bottom = (height + 1) * stride;
    for (const c of starts) expect(c >= bottom && c < bottom + stride).toBe(true);
    expect([...starts].some((c) => c !== portal)).toBe(true);
  });

  it("still wins, keeps the invariants and is solvable", () => {
    const s = new CollectSession(edged(), undefined, undefined, true);
    for (const c of [0, 1, 2]) {
      s.tap(select(c));
      settle(s);
    }
    expect(s.state.status).toBe("won");
    expect(solve(edged()).status).toBe("solved");
    const parsed = parseCollectLevel(JSON.parse(JSON.stringify(edged())));
    expect(createCollectState(parsed).params.edgeGate).toBe(true);
  });
});

describe("edge-first routes (M15.13)", () => {
  /** A 7×6 board: a ring of blue round a red centre, with blue boxes and a red box. */
  const ringed = (bias: number): CollectLevel => ({
    ...board(
      ["BBBBBBB", "BRRRRRB", "BRRRRRB", "BRRRRRB", "BRRRRRB", "BBBBBBB"],
      [[["B", 22]], [["R", 20]]],
      { colors: "BR", slots: 3, fieldCap: 3, squad: 4, spawnGap: 1 },
    ),
    sharedTrays: true,
    edgeGate: true,
    edgeBias: bias,
  });

  it("distances stay exact (equal a fresh search) while cubes are taken, and the board still wins", () => {
    const s = new CollectSession(ringed(3), undefined, undefined, true);
    s.tap(select(0));
    s.tap(select(1));
    for (let i = 0; i < 5000 && s.state.status === "playing"; i++) {
      expect(violation(s.state)).toBeNull();
      if (s.tick() === null) break;
    }
    expect(s.state.status).toBe("won");
  });

  it("a costlier inside keeps routes on the margin: fewer steps inside the picture", () => {
    const inside = (bias: number) => {
      const s = new CollectSession(ringed(bias), undefined, undefined, true);
      s.tap(select(0));
      s.tap(select(1));
      const { stride } = s.state.params;
      const rows = s.state.dist.length / stride;
      let steps = 0;
      s.subscribe((b) => {
        for (const e of b.events) {
          if (e.type !== "familiarMoved") continue;
          const x = e.to % stride;
          const y = Math.floor(e.to / stride);
          if (x > 0 && y > 0 && x < stride - 1 && y < rows - 1) steps++;
        }
      });
      settle(s);
      expect(s.state.status).toBe("won");
      return steps;
    };
    expect(inside(4)).toBeLessThan(inside(1));
  });
});

describe("row order: two fronts, from the centre out, sides taking turns (M15.13)", () => {
  /** A 7×8 board of one colour: every pick and where it came from. */
  const picks = () => {
    const level: CollectLevel = {
      ...board(new Array<string>(8).fill("RRRRRRR"), [[["R", 56]]], {
        colors: "R",
        slots: 1,
        fieldCap: 1,
        squad: 1,
        spawnGap: 1,
      }),
      sharedTrays: true,
      edgeGate: true,
      rowTargets: true,
    };
    const s = new CollectSession(level, undefined, undefined, true);
    const picked: [number, number][] = [];
    s.subscribe((b) => {
      for (const e of b.events)
        if (e.type === "cubePickedUp") {
          const stride = s.state.params.stride;
          picked.push([(e.cube % stride) - 1, Math.floor(e.cube / stride) - 1]);
        }
    });
    s.tap({ kind: "select", column: 0 });
    settle(s);
    expect(s.state.status).toBe("won");
    return picked;
  };

  it("starts at the centre of the bottom row, then the centre of the top row, taking turns", () => {
    const p = picks();
    expect(p[0]).toEqual([3, 7]);
    expect(p[1]).toEqual([3, 0]);
    // Bottom-front picks stay in the lower half, top-front picks in the upper half, while both exist.
    for (let i = 0; i < 12; i++) expect(p[i]![1] >= 4).toBe(i % 2 === 0);
  });

  it("works outward from the centre, alternating sides, and sometimes takes the row above", () => {
    const bottom = picks()
      .filter((_, i) => i % 2 === 0)
      .slice(0, 9);
    // Centre, then the other side, outward.
    expect(bottom.slice(0, 2).map(([x]) => x)).toEqual([3, 4]);
    // About a third of the picks take the next row up before the first row is done.
    const firstRowDone = bottom.findIndex(([, y]) => y === 6);
    expect(firstRowDone).toBeGreaterThan(0);
    expect(bottom.slice(0, firstRowDone).length).toBeLessThan(7);
  });
});
