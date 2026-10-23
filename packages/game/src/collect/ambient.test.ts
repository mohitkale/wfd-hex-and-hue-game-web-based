import { describe, expect, it } from "vitest";
import { moteAt, newMote } from "./ambient";
import { WORLD_IDENTITIES, WORLD_IDS } from "./worldIdentity";

describe("the lights behind the board, per world", () => {
  const times = [0, 1_000, 17_500, 60_000, 600_000];

  it.each(WORLD_IDS)(
    "%s: every light stays inside the frame and glows between 0 and 1, deterministically",
    (w) => {
      const a = WORLD_IDENTITIES[w].atmosphere;
      for (let i = 0; i < a.count; i++) {
        for (const t of times) {
          const m = moteAt(i, t, false, newMote(), a);
          expect(m.x).toBeGreaterThanOrEqual(-0.05);
          expect(m.x).toBeLessThanOrEqual(1.05);
          expect(m.y).toBeGreaterThanOrEqual(0);
          expect(m.y).toBeLessThanOrEqual(1);
          expect(m.glow).toBeGreaterThanOrEqual(0);
          expect(m.glow).toBeLessThanOrEqual(1);
          expect(moteAt(i, t, false, newMote(), a)).toEqual(m);
        }
      }
    },
  );

  it.each(WORLD_IDS)("%s: reduced motion holds every light still, at a steady glow", (w) => {
    const a = WORLD_IDENTITIES[w].atmosphere;
    for (let i = 0; i < a.count; i++) {
      const first = moteAt(i, 0, true, newMote(), a);
      for (const t of times) expect(moteAt(i, t, true, newMote(), a)).toEqual(first);
      expect(first.glow).toBe(0.6);
    }
  });

  it("the three motions behave as named", () => {
    const rise = WORLD_IDENTITIES.moonlit.atmosphere;
    const twinkle = WORLD_IDENTITIES.crystal.atmosphere;
    const orbit = WORLD_IDENTITIES.zodiac.atmosphere;
    // Rise: the light climbs (y decreases over a short time, away from the wrap).
    const a = moteAt(3, 0, false, newMote(), rise);
    const b = moteAt(3, 2_000, false, newMote(), rise);
    expect(a.y === b.y).toBe(false);
    // Twinkle: it never moves, only its glow changes.
    const t1 = moteAt(3, 0, false, newMote(), twinkle);
    const t2 = moteAt(3, 5_000, false, newMote(), twinkle);
    expect([t1.x, t1.y]).toEqual([t2.x, t2.y]);
    expect(t1.glow === t2.glow).toBe(false);
    // Orbit: it moves, but stays within a small radius of home.
    const homes = moteAt(3, 0, false, newMote(), orbit);
    let farthest = 0;
    for (const t of times) {
      const m = moteAt(3, t, false, newMote(), orbit);
      farthest = Math.max(farthest, Math.hypot(m.x - homes.x, m.y - homes.y));
    }
    expect(farthest).toBeGreaterThan(0);
    expect(farthest).toBeLessThan(0.12);
  });

  it("the Moonlit atmosphere is the original ambient look (no change for existing levels)", () => {
    const moonlit = WORLD_IDENTITIES.moonlit.atmosphere;
    for (let i = 0; i < 14; i++) {
      for (const t of times) {
        expect(moteAt(i, t, false, newMote(), moonlit)).toEqual(moteAt(i, t, false));
      }
    }
    expect(moonlit.count).toBe(14);
  });
});
