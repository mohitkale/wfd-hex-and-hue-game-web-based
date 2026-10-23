import { describe, expect, it } from "vitest";
import { emptySpellbook, recordWin } from "./v2Spellbook";
import { PULSE_MS, sealPoints, sealPulse, worldMoment } from "./worldMoment";
import { WORLD_IDENTITIES, WORLD_IDS, type SealKind } from "./worldIdentity";

const win = (ids: string[]) =>
  ids.reduce((b, id, n) => recordWin(b, id, 1000 + n).book, emptySpellbook());

describe("the world's part of a completion", () => {
  it("names the world, its seal and its backdrop", () => {
    const m = worldMoment(win(["black-cat"]), "black-cat", true)!;
    expect(m.worldName).toBe("Crystal Garden");
    expect(m.seal).toBe(WORLD_IDENTITIES.crystal.seal);
    expect(m.backdrop).toBe(WORLD_IDENTITIES.crystal.atmosphere.backdrop);
  });

  it("says first page, then progress, then every page so far", () => {
    const moonlit = ["crescent-moon", "triple-moon", "witchs-cauldron"];
    expect(worldMoment(win(moonlit.slice(0, 1)), moonlit[0]!, true)!.line).toBe(
      "First page of Moonlit Beginnings",
    );
    expect(worldMoment(win(moonlit.slice(0, 2)), moonlit[1]!, true)!.line).toBe(
      "Moonlit Beginnings · 2 of 3 pages",
    );
    expect(worldMoment(win(moonlit), moonlit[2]!, true)!.line).toBe(
      "Moonlit Beginnings: every page so far",
    );
  });

  it("a replay shows progress, never a first-page or finished claim", () => {
    const moonlit = ["crescent-moon", "triple-moon", "witchs-cauldron"];
    expect(worldMoment(win(moonlit), "crescent-moon", false)!.line).toBe(
      "Moonlit Beginnings · 3 of 3 pages",
    );
    expect(worldMoment(win(["crescent-moon"]), "crescent-moon", false)!.line).toBe(
      "Moonlit Beginnings · 1 of 3 pages",
    );
  });

  it("a world with one page so far is the first page, not 'every page'", () => {
    expect(worldMoment(win(["libra-scales"]), "libra-scales", true)!.line).toBe(
      "First page of Zodiac Realm",
    );
    expect(worldMoment(win(["libra-scales"]), "libra-scales", false)!.line).toBe(
      "Zodiac Realm · 1 of 1 page",
    );
  });

  it("is null for a picture that is not in the library", () => {
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

  it("the crescent opens to the right: all its points lie left of the inner circle's far edge", () => {
    const pts = sealPoints("crescent", 1);
    expect(Math.max(...pts.map((p) => p.x))).toBeLessThan(0.7);
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(-1, 1);
  });
});

describe("the ring pulse", () => {
  const motion = { reduced: false, skipped: false };

  it("rises, fades and ends", () => {
    expect(sealPulse(0, motion).radius).toBe(0);
    const mid = sealPulse(PULSE_MS / 2, motion);
    expect(mid.radius).toBeGreaterThan(0.5);
    expect(mid.alpha).toBeGreaterThan(0);
    expect(sealPulse(PULSE_MS, motion).alpha).toBe(0);
  });

  it("never plays with reduced motion or after a skip, or outside its window", () => {
    expect(sealPulse(300, { reduced: true, skipped: false }).alpha).toBe(0);
    expect(sealPulse(300, { reduced: false, skipped: true }).alpha).toBe(0);
    expect(sealPulse(-5, motion).alpha).toBe(0);
  });
});
