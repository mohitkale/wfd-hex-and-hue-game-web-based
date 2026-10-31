import { describe, expect, it } from "vitest";
import { emptySpellbook, recordWin } from "./v2Spellbook";
import { PULSE_MS, sealPoints, sealPulse, shouldPulse, worldMoment } from "./worldMoment";
import { WORLD_IDENTITIES, WORLD_IDS, type SealKind } from "./worldIdentity";

const win = (ids: string[]) =>
  ids.reduce((b, id, n) => recordWin(b, id, 1000 + n).book, emptySpellbook());

describe("the chapter's part of a completion (M15.13: the journey)", () => {
  it("names the chapter, and the seal and backdrop of the picture's theme", () => {
    const m = worldMoment(win(["amethyst"]), "amethyst", true)!;
    expect(m.worldName).toBe("Crystals");
    expect(m.seal).toBe(WORLD_IDENTITIES.crystal.seal);
    expect(m.backdrop).toBe(WORLD_IDENTITIES.crystal.backdrop);
  });

  it("says first page, then progress, then every page once the chapter is complete", () => {
    const ch = ["candle", "witchs-hat", "broom", "blessed-cat"];
    expect(worldMoment(win(ch.slice(0, 1)), ch[0]!, true)!.line).toBe("First page of The Calling");
    expect(worldMoment(win(ch.slice(0, 2)), ch[1]!, true)!.line).toBe("The Calling · 2 of 4 pages");
    expect(worldMoment(win(ch), ch[3]!, true)!.line).toBe("The Calling: every page collected");
  });

  it("a replay shows progress, never a first-page or finished claim", () => {
    const ch = ["candle", "witchs-hat", "broom", "blessed-cat"];
    expect(worldMoment(win(ch), "candle", false)!.line).toBe("The Calling · 4 of 4 pages");
    expect(worldMoment(win(["candle"]), "candle", false)!.line).toBe("The Calling · 1 of 4 pages");
  });

  it("is null for a picture that is not on the journey", () => {
    expect(worldMoment(win([]), "no-such-piece", true)).toBeNull();
  });

  it("each world has its own seal", () => {
    const kinds = WORLD_IDS.map((w) => WORLD_IDENTITIES[w].seal.kind);
    expect(new Set(kinds).size).toBe(WORLD_IDS.length);
  });
});

describe("the seal", () => {
  it("draws every kind inside its radius, as a real outline", () => {
    for (const kind of ["crescent", "crystal", "star"] as SealKind[]) {
      const pts = sealPoints(kind, 10);
      expect(pts.length, kind).toBeGreaterThanOrEqual(6);
      for (const p of pts) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y), kind).toBe(true);
        expect(Math.hypot(p.x, p.y), kind).toBeLessThanOrEqual(10 + 1e-9);
      }
    }
  });

  it("the crescent is a crescent: no point lies inside the cut-out circle", () => {
    const pts = sealPoints("crescent", 1);
    for (const p of pts) expect(Math.hypot(p.x - 0.45, p.y)).toBeGreaterThanOrEqual(0.8 - 1e-9);
    expect(Math.max(...pts.map((p) => p.x))).toBeLessThan(0.7);
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(-1, 1);
  });
});

describe("the ring pulse", () => {
  it("rises, fades and ends", () => {
    expect(sealPulse(0).radius).toBe(0);
    const mid = sealPulse(PULSE_MS / 2);
    expect(mid.radius).toBeGreaterThan(0.5);
    expect(mid.alpha).toBeGreaterThan(0);
    expect(sealPulse(PULSE_MS).alpha).toBe(0);
    expect(sealPulse(-5).alpha).toBe(0);
  });

  it("plays only when the reveal ran by itself, with motion, first time, in a world", () => {
    const base = { skipped: false, reduced: false, instant: false, hasWorld: true };
    expect(shouldPulse(base)).toBe(true);
    expect(shouldPulse({ ...base, skipped: true })).toBe(false);
    expect(shouldPulse({ ...base, reduced: true })).toBe(false);
    expect(shouldPulse({ ...base, instant: true })).toBe(false);
    expect(shouldPulse({ ...base, hasWorld: false })).toBe(false);
  });
});
