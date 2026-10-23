import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { createRng } from "@hexhue/core";
import { MAX_HINT_WORDS, Tutorial, type Hint, type Step } from "./tutorial";
import { TUTORIAL, TUTORIAL_IDS, tutorialById } from "./tutorialLevels";
import {
  emptyTutorialBook,
  markDone,
  markSkipped,
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

/** Plays a tutorial level by doing exactly what each hint points at; returns the hints it showed. */
function followHints(id: string): { won: boolean; hints: Hint[] } {
  const t = tutorialById(id)!;
  const session = new collect.CollectSession(t.make());
  const tutorial = new Tutorial(t.script());
  const hints: Hint[] = [];
  const look = (): Hint | null => {
    const hint = tutorial.update(session.state);
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

describe("the four tutorial levels", () => {
  it("are in teaching order, with distinct ids", () => {
    expect(TUTORIAL_IDS).toEqual([
      "tutorial-summon",
      "tutorial-blocked",
      "tutorial-slots",
      "tutorial-undo",
    ]);
    expect(new Set(TUTORIAL_IDS).size).toBe(4);
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
      expect(hints.length).toBeGreaterThanOrEqual(3);
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
      "red-free",
    ]);
    expect(followHints("tutorial-slots").hints.map((h) => h.id)).toEqual([
      "send-red",
      "waits",
      "clear-blue",
      "wake",
    ]);
    expect(followHints("tutorial-undo").hints.map((h) => h.id)).toEqual([
      "red",
      "green",
      "undo",
      "blue",
      "finish",
    ]);
  });

  it("the undo level really does lose on the pointed-at mistake, and Undo really does recover", () => {
    const t = tutorialById("tutorial-undo")!;
    const session = new collect.CollectSession(t.make());
    session.tap({ kind: "select", column: 0 });
    settle(session);
    session.tap({ kind: "select", column: 1 });
    settle(session);
    expect(session.state.status).toBe("lost");
    expect(session.undo()).toBe(true);
    expect(session.state.status).toBe("playing");
  });

  it("a refused tap on the buried colour is what teaches it (and costs nothing)", () => {
    const session = new collect.CollectSession(tutorialById("tutorial-blocked")!.make());
    const before = JSON.stringify(session.state);
    const r = session.tap({ kind: "select", column: 0 });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(session.state)).toBe(before);
  });
});

describe("the tutorial never gets in the way", () => {
  it("ignoring every hint and playing at random never breaks the machine; hints stay valid", () => {
    for (const t of TUTORIAL) {
      for (let seed = 1; seed <= 12; seed++) {
        const rng = createRng(seed);
        const session = new collect.CollectSession(t.make());
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
          if (hint?.target?.kind === "column")
            expect(hint.target.index).toBeLessThan(session.state.columns.length);
          if (hint?.target?.kind === "slot")
            expect(hint.target.index).toBeLessThan(session.state.slots.length);
        }
      }
    }
  });

  it("a hint is only a picture: it has no way to stop a tap", () => {
    // The machine takes the state read-only and returns data; taps go straight to the session.
    const t = tutorialById("tutorial-summon")!;
    const session = new collect.CollectSession(t.make());
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
    const session = new collect.CollectSession(level);
    let note: string | null = null;
    session.subscribe((b) => {
      for (const e of b.events) note = eventNote(e) ?? note;
    });
    session.tap({ kind: "select", column: 0 });
    settle(session);
    expect(note).toBe("Nothing left to reach: it waits");
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
    expect(tutorialStart("?level=tutorial-undo", undefined, markSkipped(fresh))).toBe(
      "tutorial-undo",
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
