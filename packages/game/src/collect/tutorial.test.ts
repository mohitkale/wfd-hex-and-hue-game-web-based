import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { createRng } from "@hexhue/core";
import { MAX_HINT_WORDS, Tutorial, type Hint, type Step } from "./tutorial";
import { TUTORIAL, TUTORIAL_IDS, createTutorial, tutorialById } from "./tutorialLevels";
import {
  emptyTutorialBook,
  markDone,
  markSkipped,
  nextAfter,
  nextTutorial,
  parseTutorialBook,
  readTutorialBook,
  saveTutorialBook,
  shouldOfferTutorial,
  TUTORIAL_KEY,
} from "./tutorialBook";

/** M14.2: the tutorial teaches by interaction, in tiny solver-verified levels, and never gets in the way. */

const settle = (session: collect.CollectSession) => {
  for (let i = 0; i < 100_000 && session.tick() !== null; i++) {
    /* run to settled */
  }
};

/**
 * Whether a hint is true for the state it is shown in: a column hint points at a front group that can
 * really be tapped (except the lesson that teaches the refusal), a slot hint at an occupied slot, and
 * the Undo hint appears only after a loss.
 */
function hintProblem(hint: Hint, state: collect.CollectState): string | null {
  const t = hint.target;
  if (t?.kind === "column") {
    if (!state.columns[t.index]?.length) return `${hint.id}: column ${t.index} is empty`;
    const ok = collect.explain(state, { kind: "select", column: t.index }) === "ok";
    if (!ok && hint.id !== "try-red") return `${hint.id}: column ${t.index} cannot be tapped now`;
  }
  if (t?.kind === "slot" && state.slots[t.index] == null)
    return `${hint.id}: slot ${t.index} is empty`;
  if (t?.kind === "undo" && state.status !== "lost")
    return `${hint.id}: Undo is pointed at but nothing is lost`;
  if (hint.id === "waits" && !state.slots.some((id) => id !== null)) return "waits: nothing waits";
  if (hint.id === "red-free" && !collect.hasAssignable(state, 1))
    return "red-free: red is not reachable yet";
  return null;
}

/** Plays a tutorial level by doing exactly what each hint points at; returns the hints it showed. */
function followHints(id: string): { won: boolean; hints: Hint[] } {
  const t = tutorialById(id)!;
  const session = new collect.CollectSession(t.make(), undefined, undefined, true);
  const tutorial = new Tutorial(t.script());
  const hints: Hint[] = [];
  const look = (): Hint | null => {
    const hint = tutorial.update(session.state);
    if (hint) expect(hintProblem(hint, session.state), `${id}`).toBeNull();
    if (hint && hints[hints.length - 1]?.id !== hint.id) hints.push(hint);
    return hint;
  };
  /** Lets play run tick by tick, as it does on screen, looking at the hint after each tick. */
  const watch = () => {
    for (let i = 0; i < 100_000 && session.tick() !== null; i++) look();
  };
  for (let guard = 0; guard < 200; guard++) {
    const hint = look();
    const state = session.state;
    if (state.status === "won") break;
    const target = hint?.target ?? null;
    if (state.status === "lost") {
      if (target?.kind !== "undo") break; // a loss the script does not teach: stop
      session.undo();
      tutorial.note("undone");
      continue;
    }
    if (target?.kind === "column") {
      const r = session.tap({ kind: "select", column: target.index });
      if (!r.ok) tutorial.note("rejected");
      watch();
    } else if (target?.kind === "slot") {
      session.tap({ kind: "resume", slot: target.index });
      watch();
    } else {
      // No target (a step to watch, or the tutorial is over): let play go on by itself.
      const legal = collect.legalActions(session.state);
      if (legal.length === 0) break;
      session.tap(legal[0]!);
      watch();
    }
  }
  return { won: session.state.status === "won", hints };
}

describe("the machine", () => {
  const step = (id: string, done: Step["done"], text = "Tap it"): Step => ({
    id,
    text,
    target: () => null,
    done,
  });
  const state = (over: Partial<collect.CollectState> = {}) =>
    ({ status: "playing", deliveredTotal: 0, ...over }) as collect.CollectState;

  it("shows one hint at a time and moves on only when the player has done what it teaches", () => {
    const t = new Tutorial([
      step("a", ({ state }) => state.deliveredTotal >= 1),
      step("b", ({ seen }) => seen.has("x")),
    ]);
    expect(t.update(state())?.id).toBe("a");
    expect(t.update(state())?.id).toBe("a"); // asking again changes nothing
    expect(t.update(state({ deliveredTotal: 1 }))?.id).toBe("b");
    t.note("x");
    expect(t.update(state())).toBeNull();
    expect(t.finished).toBe(true);
    expect(t.position).toBe(2);
  });

  it("never goes back: what was taught stays taught, even if the state changes (undo)", () => {
    const t = new Tutorial([
      step("a", ({ state }) => state.deliveredTotal >= 1),
      step("b", () => false),
    ]);
    expect(t.update(state({ deliveredTotal: 1 }))?.id).toBe("b");
    expect(t.update(state({ deliveredTotal: 0 }))?.id).toBe("b");
    expect(t.position).toBe(1);
  });

  it("can be skipped at any moment, after which it shows nothing", () => {
    const t = new Tutorial([step("a", () => false)]);
    expect(t.update(state())).not.toBeNull();
    t.skip();
    expect(t.update(state())).toBeNull();
    expect(t.finished).toBe(true);
  });

  it("refuses a hint longer than six words: no long text instructions", () => {
    expect(
      () => new Tutorial([step("long", () => true, "one two three four five six seven")]),
    ).toThrow(/longer than 6 words/);
    for (const t of TUTORIAL)
      for (const s of t.script()) {
        expect(s.text.trim().split(/\s+/).length, s.id).toBeLessThanOrEqual(MAX_HINT_WORDS);
      }
  });
});

describe("the three tutorial levels", () => {
  it("are in teaching order, with distinct ids (no Undo lesson: there is no Undo)", () => {
    expect(TUTORIAL_IDS).toEqual(["tutorial-summon", "tutorial-blocked", "tutorial-slots"]);
    expect(new Set(TUTORIAL_IDS).size).toBe(3);
  });

  it("play by the game's rules: every tray works", () => {
    for (const t of TUTORIAL) expect(t.make().sharedTrays, t.id).toBe(true);
  });

  it.each(TUTORIAL.map((t) => [t.id]))("%s is valid and the solver can win it", (id) => {
    const level = tutorialById(id)!.make();
    expect(collect.validateCollectLevel(level)).toEqual([]);
    const result = collect.solve(level, 100_000);
    expect(result.status).toBe("solved");
    expect(collect.replayLine(level, result.line!).state.status).toBe("won");
    // Tiny: a tutorial level is never a puzzle to study.
    expect(level.width * level.height).toBeLessThanOrEqual(25);
  });

  it.each(TUTORIAL.map((t) => [t.id]))(
    "%s: doing what the hints say wins it, and every hint has a real target",
    (id) => {
      const { won, hints } = followHints(id);
      expect(won).toBe(true);
      expect(hints.length).toBeGreaterThanOrEqual(2);
    },
  );

  it("teaches each of the things the roadmap lists, in order", () => {
    expect(followHints("tutorial-summon").hints.map((h) => h.id)).toEqual([
      "summon",
      "watch",
      "again",
    ]);
    expect(followHints("tutorial-blocked").hints.map((h) => h.id)).toEqual([
      "try-red",
      "clear-blue",
    ]);
    expect(followHints("tutorial-slots").hints.map((h) => h.id)).toEqual(["send-red", "waits"]);
  });

  it("a tap on the buried colour waits in a tray, and wakes by itself once the blue is cleared", () => {
    const session = new collect.CollectSession(
      tutorialById("tutorial-blocked")!.make(),
      undefined,
      undefined,
      true,
    );
    expect(session.tap({ kind: "select", column: 0 }).ok).toBe(true);
    expect(session.state.groups[0]!.status).toBe("waiting");
    session.tap({ kind: "select", column: 1 });
    settle(session);
    expect(session.state.status).toBe("won");
  });
});

describe("the tutorial never gets in the way", () => {
  it("ignoring every hint and playing at random never breaks the machine; hints stay valid", () => {
    for (const t of TUTORIAL) {
      for (let seed = 1; seed <= 12; seed++) {
        const rng = createRng(seed);
        const session = new collect.CollectSession(t.make(), undefined, undefined, true);
        const tutorial = new Tutorial(t.script());
        let last = 0;
        for (let move = 0; move < 60 && session.state.status === "playing"; move++) {
          const legal = collect.legalActions(session.state);
          if (legal.length === 0) break;
          session.tap(legal[rng.int(0, legal.length - 1)]!);
          settle(session);
          const hint = tutorial.update(session.state);
          expect(tutorial.position, `${t.id} seed ${seed}`).toBeGreaterThanOrEqual(last);
          last = tutorial.position;
          if (hint) expect(hintProblem(hint, session.state), `${t.id} seed ${seed}`).toBeNull();
        }
      }
    }
  });

  it("a hint is only a picture: it has no way to stop a tap", () => {
    // The machine takes the state read-only and returns data; taps go straight to the session.
    const t = tutorialById("tutorial-summon")!;
    const session = new collect.CollectSession(t.make(), undefined, undefined, true);
    const tutorial = new Tutorial(t.script());
    expect(tutorial.update(session.state)?.target).toEqual({ kind: "column", index: 0 });
    // Tapping the *other* column is just as legal.
    expect(session.tap({ kind: "select", column: 1 }).ok).toBe(true);
  });
});

describe("the tutorial book", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };

  it("starts empty, offers the first level, and moves along as levels are finished", () => {
    let book = emptyTutorialBook();
    expect(nextTutorial(book)).toBe("tutorial-summon");
    expect(shouldOfferTutorial(book)).toBe(true);
    book = markDone(book, "tutorial-summon");
    expect(nextTutorial(book)).toBe("tutorial-blocked");
    for (const id of TUTORIAL_IDS) book = markDone(book, id);
    expect(nextTutorial(book)).toBeNull();
    expect(shouldOfferTutorial(book)).toBe(false);
  });

  it("is never offered again once skipped, and ignores ids it does not know", () => {
    expect(shouldOfferTutorial(markSkipped(emptyTutorialBook()))).toBe(false);
    const book = markDone(emptyTutorialBook(), "not-a-tutorial");
    expect(book.done).toEqual([]);
    // Finishing in any order is remembered in teaching order.
    const b2 = markDone(markDone(emptyTutorialBook(), "tutorial-slots"), "tutorial-summon");
    expect(b2.done).toEqual(["tutorial-summon", "tutorial-slots"]);
  });

  it("round-trips through storage, drops junk, and never throws", () => {
    const store = memory();
    const b = markDone(emptyTutorialBook(), "tutorial-summon");
    expect(saveTutorialBook(store, b)).toBe(true);
    expect(store.data.has(TUTORIAL_KEY)).toBe(true);
    expect(readTutorialBook(store)).toEqual({ book: b, ok: true });
    expect(parseTutorialBook({ done: ["tutorial-slots", "evil", 5], skipped: "yes" })).toEqual({
      version: 1,
      done: ["tutorial-slots"],
      skipped: false,
    });
    for (const junk of [null, 3, "x", [], { done: "no" }])
      expect(parseTutorialBook(junk)).toEqual(emptyTutorialBook());
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(readTutorialBook(broken)).toEqual({ book: emptyTutorialBook(), ok: false });
    expect(saveTutorialBook(broken, b)).toBe(false);
    expect(saveTutorialBook(null, b)).toBe(false);
  });
});

describe("explaining why", () => {
  it("says why a group went to wait, only when it still has cubes to deliver", async () => {
    const { eventNote } = await import("./notes");
    const level = tutorialById("tutorial-slots")!.make();
    const session = new collect.CollectSession(level, undefined, undefined, true);
    let note: string | null = null;
    session.subscribe((b) => {
      for (const e of b.events) note = eventNote(e) ?? note;
    });
    session.tap({ kind: "select", column: 0 });
    settle(session);
    expect(note).toBe("It waits here and starts by itself");
    expect(eventNote({ type: "groupParked", group: 0, slot: 0, remaining: 0 })).toBeNull();
    expect(eventNote({ type: "won" })).toBeNull();
  });
});

describe("where a visit starts", () => {
  it("first visit: the tutorial; skipped or finished: the game; ?level= and ?demo= are left alone", async () => {
    const { tutorialStart } = await import("./levels");
    const fresh = emptyTutorialBook();
    expect(tutorialStart("", undefined, fresh)).toBe("tutorial-summon");
    expect(tutorialStart("?engine=v2", null, markDone(fresh, "tutorial-summon"))).toBe(
      "tutorial-blocked",
    );
    expect(tutorialStart("", undefined, markSkipped(fresh))).toBeNull();
    const all = TUTORIAL_IDS.reduce(markDone, fresh);
    expect(tutorialStart("", undefined, all)).toBeNull();
    expect(tutorialStart("?level=slice", undefined, fresh)).toBeNull();
    expect(tutorialStart("?level=art-black-cat", undefined, fresh)).toBeNull();
    expect(tutorialStart("?demo=win", undefined, fresh)).toBeNull();
    // An explicit ask always gets it, even after a skip; "tutorial" means the next unfinished level.
    expect(tutorialStart("?level=tutorial", undefined, markSkipped(fresh))).toBe("tutorial-summon");
    expect(tutorialStart("?level=tutorial", undefined, markDone(fresh, "tutorial-summon"))).toBe(
      "tutorial-blocked",
    );
    expect(tutorialStart("?level=tutorial", undefined, all)).toBe("tutorial-summon");
    expect(tutorialStart("?level=tutorial-slots", undefined, markSkipped(fresh))).toBe(
      "tutorial-slots",
    );
    // A choice made in the game (the end card's Next / Play) wins over the address bar.
    expect(tutorialStart("", "slice", fresh)).toBeNull();
    expect(tutorialStart("", "tutorial", markDone(fresh, "tutorial-summon"))).toBe(
      "tutorial-blocked",
    );
  });

  it("every tutorial level is reachable as a level", async () => {
    const { DEV_LEVELS, levelFromSearch } = await import("./levels");
    for (const id of TUTORIAL_IDS) {
      expect(DEV_LEVELS[id]).toBeDefined();
      expect(levelFromSearch("", id).id).toBe(id);
    }
  });
});

describe("other roads: the hint stays true when the player does things in another order", () => {
  /** Taps these actions in order (skipping any that is refused), checking every hint on every tick. */
  const play = (id: string, actions: collect.Action[]) => {
    const t = tutorialById(id)!;
    const session = new collect.CollectSession(t.make(), undefined, undefined, true);
    const tutorial = new Tutorial(t.script());
    const seenHints: string[] = [];
    const look = () => {
      const hint = tutorial.update(session.state);
      if (hint) {
        expect(hintProblem(hint, session.state), id).toBeNull();
        if (seenHints[seenHints.length - 1] !== hint.id) seenHints.push(hint.id);
      }
    };
    for (const a of actions) {
      look();
      const r = session.tap(a);
      if (!r.ok) tutorial.note("rejected");
      for (let i = 0; i < 100_000 && session.tick() !== null; i++) look();
    }
    look();
    return { session, tutorial, seenHints };
  };
  const sel = (column: number): collect.Action => ({ kind: "select", column });

  it("slots: blue first means red never waits, and 'it waits' is never said", () => {
    const { session, seenHints } = play("tutorial-slots", [sel(2), sel(0), sel(1)]);
    expect(session.state.status).toBe("won");
    expect(seenHints).not.toContain("waits");
  });

  it("slots: red waits, the blue wakes it by itself (no tap on the waiting box), and 'it waits' is said", () => {
    const { seenHints, session } = play("tutorial-slots", [sel(0), sel(2), sel(1)]);
    expect(seenHints).toContain("waits");
    expect(session.state.status).toBe("won");
    expect(session.log.some((e) => e.auto)).toBe(true);
  });

  it("buried colour: clearing the blue first (never trying red) still teaches the way through", () => {
    const { session, seenHints } = play("tutorial-blocked", [sel(1), sel(0)]);
    expect(session.state.status).toBe("won");
    // The first hint is on screen before the player's first tap; red wakes by itself, so no tap is asked.
    expect(seenHints).toEqual(["try-red"]);
  });

  it("summon: the second group first is fine too", () => {
    const { session } = play("tutorial-summon", [sel(1), sel(0)]);
    expect(session.state.status).toBe("won");
  });
});

describe("a step waits until its hint is true", () => {
  const state = (over: Partial<collect.CollectState> = {}) =>
    ({ status: "playing", deliveredTotal: 0, ...over }) as collect.CollectState;
  it("shows nothing (and does not advance) while not ready, then shows it", () => {
    let ready = false;
    const t = new Tutorial([
      {
        id: "a",
        text: "Tap it",
        target: () => null,
        ready: () => ready,
        done: ({ shown }) => shown && ready,
      },
      { id: "b", text: "Then this", target: () => null, done: () => false },
    ]);
    expect(t.update(state())).toBeNull();
    expect(t.position).toBe(0);
    ready = true;
    expect(t.update(state())?.id).toBe("a"); // now shown
    expect(t.update(state())?.id).toBe("b"); // done: shown and ready
  });
});

describe("Skip lasts the whole visit", () => {
  it("a machine made after a skip (a retry, or Next) shows nothing", () => {
    for (const id of TUTORIAL_IDS) {
      const t = createTutorial(id, true)!;
      const session = new collect.CollectSession(
        tutorialById(id)!.make(),
        undefined,
        undefined,
        true,
      );
      expect(t.update(session.state)).toBeNull();
      expect(t.finished).toBe(true);
      expect(createTutorial(id, false)!.update(session.state)).not.toBeNull();
    }
    expect(createTutorial("not-a-tutorial")).toBeNull();
  });

  it("Next goes on to the level after the one just finished, then back to any not finished", () => {
    let book = emptyTutorialBook();
    expect(nextAfter(book, "tutorial-summon")).toBe("tutorial-blocked");
    // Finishing the last one first: back to the first not finished.
    book = markDone(book, "tutorial-undo");
    expect(nextAfter(book, "tutorial-undo")).toBe("tutorial-summon");
    for (const id of TUTORIAL_IDS) book = markDone(book, id);
    expect(nextAfter(book, "tutorial-undo")).toBeNull();
  });
});
