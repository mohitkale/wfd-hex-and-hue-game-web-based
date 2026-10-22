import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "../rng";
import { apply, legalActions } from "./actions";
import { randomLevel } from "./fixtures";
import { violation } from "./invariants";
import { validateCollectLevel, type CollectLevel } from "./level";
import { isSettled, step } from "./sim";
import { cloneState, createCollectState, fromJSON, hashState, type CollectState } from "./state";

/** Plays one game: random legal actions, sometimes while familiars are still out. */
function play(
  level: CollectLevel,
  seed: number,
  hook?: (s: CollectState, rng: Rng) => CollectState,
): CollectState {
  const rng = createRng(seed);
  let s = createCollectState(level);
  for (let i = 0; i < 20_000 && s.status === "playing"; i++) {
    const act = isSettled(s) || rng.next() < 0.15;
    if (act) {
      const legal = legalActions(s);
      if (legal.length > 0) apply(s, legal[rng.int(0, legal.length - 1)]!);
    }
    step(s);
    const bad = violation(s);
    if (bad) throw new Error(`${level.id} tick ${s.tick}: ${bad}`);
    if (hook) s = hook(s, rng);
  }
  return s;
}

function collect(tight: boolean, count: number): CollectLevel[] {
  const out: CollectLevel[] = [];
  for (let seed = 1; seed <= 2000 && out.length < count; seed++) {
    const level = randomLevel(seed, tight);
    if (level && validateCollectLevel(level).length === 0) out.push(level);
  }
  return out;
}

const easy = collect(false, 100);
const tight = collect(true, 300);
const levels: CollectLevel[] = [...easy.slice(0, 50), ...tight];

describe("random games", () => {
  it("generates enough valid boards to be meaningful", () => {
    expect(easy.length).toBeGreaterThanOrEqual(60);
    expect(tight.length).toBeGreaterThanOrEqual(200);
  });

  it("keep every invariant after every tick and always end", () => {
    let won = 0;
    let slotsFull = 0;
    let deadlock = 0;
    let parked = 0;
    levels.forEach((level, i) => {
      const s = play(level, 1000 + i, (state) => {
        if (state.slots.some((x) => x !== null)) parked++;
        return state;
      });
      expect(s.status, level.id).not.toBe("playing");
      if (s.status === "won") won++;
      else if (s.lossReason === "slotsFull") slotsFull++;
      else deadlock++;
    });
    // Wins, parked groups and both kinds of loss all occur, so the invariants above were
    // exercised on every path through the rules.
    expect(won).toBeGreaterThan(10);
    expect(parked).toBeGreaterThan(10);
    expect(slotsFull).toBeGreaterThan(2);
    expect(deadlock).toBeGreaterThan(5);
  });

  it("a won game has delivered every cube and completed every group", () => {
    for (const [i, level] of levels.entries()) {
      const s = play(level, 2000 + i);
      if (s.status !== "won") continue;
      expect(s.deliveredTotal).toBe(s.cubesTotal);
      expect(s.groups.every((g) => g.status === "completed" && g.delivered === g.capacity)).toBe(
        true,
      );
      expect(s.grid.every((c) => c === -1)).toBe(true);
    }
  });

  it("is deterministic: the same seed gives the same final state", () => {
    for (const [i, level] of levels.slice(0, 40).entries()) {
      expect(hashState(play(level, 3000 + i))).toBe(hashState(play(level, 3000 + i)));
    }
  });

  it("survives a JSON round trip mid-game: rebuilt caches behave identically", () => {
    for (const [i, level] of levels.slice(0, 60).entries()) {
      // Play to a random mid-game point, then continue the original and the JSON copy in lockstep.
      const rng = createRng(4000 + i);
      const s = createCollectState(level);
      const stopAt = rng.int(1, 40);
      for (let t = 0; t < stopAt && s.status === "playing"; t++) {
        if (isSettled(s)) {
          const legal = legalActions(s);
          if (legal.length === 0) break;
          apply(s, legal[rng.int(0, legal.length - 1)]!);
        }
        step(s);
      }
      const mid = s;
      const copy = fromJSON(JSON.parse(JSON.stringify(mid)));
      expect(hashState(copy), level.id).toBe(hashState(mid));
      expect(violation(copy), level.id).toBeNull();
      const clone = cloneState(mid);
      for (let t = 0; t < 3000 && mid.status === "playing"; t++) {
        if (isSettled(mid)) {
          const legal = legalActions(mid);
          if (legal.length === 0) break;
          const a = legal[rng.int(0, legal.length - 1)]!;
          apply(mid, a);
          apply(copy, a);
          apply(clone, a);
        }
        step(mid);
        step(copy);
        step(clone);
        expect(hashState(copy)).toBe(hashState(mid));
        expect(hashState(clone)).toBe(hashState(mid));
      }
    }
  });

  it("cloneState is independent of the original", () => {
    const level = levels[0]!;
    const s = createCollectState(level);
    const legal = legalActions(s);
    const copy = cloneState(s);
    apply(s, legal[0]!);
    step(s);
    expect(s.tick).toBe(1);
    expect(copy.tick).toBe(0);
    expect(copy.groups.every((g) => g.status === "queued")).toBe(true);
    expect(copy.columns).not.toBe(s.columns);
  });
});
