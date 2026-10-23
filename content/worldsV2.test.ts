import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STAGES, stageForLevel } from "./curveV2";
import { tierForLevel } from "./difficulty";
import { POOL } from "./poolV2";
import { pieces, SHIPPED } from "./v2art";
import {
  TOTAL_LEVELS,
  WORLDS,
  WORLD_SIZE,
  progress,
  slots,
  worldOfLevel,
  worldOfTheme,
} from "./worldsV2";
import {
  WORLD_IDENTITIES,
  WORLD_IDS,
  atmosphereForTheme,
  type WorldId,
} from "../packages/game/src/collect/worldIdentity";
import { THEMES } from "../tools/art/piece";

/** M13.1: the three worlds as a plan on the curve, and what makes each recognisable beyond colour. */

describe("the worlds are a valid plan", () => {
  it("own consecutive blocks of twenty levels from 1, with no gap or overlap", () => {
    expect(WORLDS.map((w) => w.id)).toEqual(["moonlit", "crystal", "zodiac"]);
    expect(WORLDS[0]!.from).toBe(1);
    for (let i = 1; i < WORLDS.length; i++) expect(WORLDS[i]!.from).toBe(WORLDS[i - 1]!.to + 1);
    for (const w of WORLDS) expect(w.to - w.from + 1).toBe(WORLD_SIZE);
    expect(TOTAL_LEVELS).toBe(60);
  });

  it("maps every level to one world and rejects numbers outside them", () => {
    expect([1, 20, 21, 40, 41, 60].map(worldOfLevel)).toEqual([
      "moonlit",
      "moonlit",
      "crystal",
      "crystal",
      "zodiac",
      "zodiac",
    ]);
    for (const bad of [0, 61, -3])
      expect(() => worldOfLevel(bad)).toThrow("outside the three worlds");
  });

  it("has a slot per level, in order, on the curve's stage and tier", () => {
    const all = slots();
    expect(all).toHaveLength(60);
    all.forEach((s, i) => {
      expect(s.level).toBe(i + 1);
      expect(s.world).toBe(worldOfLevel(s.level));
      expect(s.stage).toBe(stageForLevel(s.level).id);
      expect(s.tier).toBe(tierForLevel(s.level));
      expect(s.plan.length).toBeGreaterThan(20);
    });
  });

  it("rises across the worlds: Moonlit opens the curve, Zodiac Realm ends in the advanced stage", () => {
    const stagesOf = (w: WorldId) =>
      new Set(
        slots()
          .filter((s) => s.world === w)
          .map((s) => s.stage),
      );
    expect(stagesOf("moonlit")).toEqual(
      new Set(["learn", "blocked-and-slots", "partial-and-dependencies"]),
    );
    expect(stagesOf("crystal")).toEqual(new Set(["partial-and-dependencies", "ordering"]));
    expect(stagesOf("zodiac")).toEqual(new Set(["ordering", "advanced"]));
    expect(STAGES.every((st) => slots().some((s) => s.stage === st.id))).toBe(true);
  });
});

describe("each world is recognisable beyond its colours", () => {
  const ids = WORLD_IDS;
  const ident = (w: WorldId) => WORLD_IDENTITIES[w];

  it("claims different subjects: no art theme belongs to two worlds", () => {
    const all = ids.flatMap((w) => ident(w).themes);
    expect(new Set(all).size).toBe(all.length);
    for (const w of ids) expect(ident(w).themes.length).toBeGreaterThan(0);
  });

  it("every art theme except 'other' is claimed by a world", () => {
    for (const t of THEMES) {
      if (t === "other") expect(worldOfTheme(t)).toBeNull();
      else expect(worldOfTheme(t), t).not.toBeNull();
    }
  });

  it("moves its lights differently: three different motions, counts and speeds (not a recolour)", () => {
    const a = ids.map((w) => ident(w).atmosphere);
    expect(new Set(a.map((x) => x.motion)).size).toBe(3);
    expect(new Set(a.map((x) => x.count)).size).toBe(3);
    expect(new Set(a.map((x) => x.speed)).size).toBe(3);
    expect(new Set(a.map((x) => x.backdrop)).size).toBe(3);
    // Same colours would still be a different atmosphere; here the tints differ too, but motion decides.
    expect(a.map((x) => x.motion).sort()).toEqual(["orbit", "rise", "twinkle"]);
  });

  it("leans on different colour families and speaks in its own voice", () => {
    const leads = ids.map((w) => ident(w).families[0]);
    expect(new Set(leads).size).toBe(3);
    expect(new Set(ids.map((w) => ident(w).voice)).size).toBe(3);
    expect(new Set(ids.map((w) => ident(w).tagline)).size).toBe(3);
  });

  it("gives a picture its world's atmosphere, and an unclaimed or unknown theme the Moonlit default", () => {
    expect(atmosphereForTheme("crystal")).toBe(ident("crystal").atmosphere);
    expect(atmosphereForTheme("astrology")).toBe(ident("zodiac").atmosphere);
    expect(atmosphereForTheme("moon")).toBe(ident("moonlit").atmosphere);
    expect(atmosphereForTheme("ritual")).toBe(ident("moonlit").atmosphere);
    expect(atmosphereForTheme("other")).toBe(ident("moonlit").atmosphere);
    expect(atmosphereForTheme(undefined)).toBe(ident("moonlit").atmosphere);
  });

  it("every atmosphere is well-formed", () => {
    for (const w of ids) {
      const a = ident(w).atmosphere;
      expect(a.count).toBeGreaterThan(5);
      expect(a.count).toBeLessThanOrEqual(40);
      expect(a.tints.length).toBeGreaterThan(0);
      expect(a.size.min).toBeGreaterThan(0);
      expect(a.brightness).toBeGreaterThan(0);
      expect(a.brightness).toBeLessThanOrEqual(0.5);
      expect(a.twinkle).toBeGreaterThanOrEqual(0);
      expect(a.twinkle).toBeLessThanOrEqual(1);
      expect(a.speed).toBeGreaterThan(0);
    }
  });
});

describe("world content", () => {
  it("every pool level (a level that passes the gate) sits in a slot of a world at its own number", () => {
    const placed = new Map(
      slots()
        .filter((s) => s.levelId)
        .map((s) => [s.levelId!, s.level]),
    );
    expect(new Map(POOL.map((p) => [p.id, p.level]))).toEqual(placed);
  });

  it("the library's pieces belong to worlds by theme, and placed ones are in a world that claims their theme", () => {
    const byId = new Map(pieces.map((p) => [`art-${p.id}`, p]));
    for (const s of slots().filter((x) => x.levelId && byId.has(x.levelId))) {
      const piece = byId.get(s.levelId!)!;
      expect(worldOfTheme(piece.theme), piece.id).toBe(s.world);
    }
    expect(worldOfTheme(pieces.find((p) => p.id === "amethyst-cluster")!.theme)).toBe("crystal");
    expect(worldOfTheme(pieces.find((p) => p.id === "libra-scales")!.theme)).toBe("zodiac");
  });

  it("reports honestly how much of each world exists", () => {
    const p = progress();
    expect(p.map((x) => x.placed + x.planned)).toEqual([20, 20, 20]);
    expect(p.reduce((n, x) => n + x.placed, 0)).toBe(POOL.length);
    // Nothing is shipped to players yet: the pool is a gated review set, SHIPPED is empty.
    expect(SHIPPED).toEqual([]);
  });

  it("the doc's world table matches the code", () => {
    // Prettier pads table cells; compare with runs of spaces collapsed.
    const doc = readFileSync(new URL("../docs/V2_WORLDS.md", import.meta.url), "utf8").replace(
      / +/g,
      " ",
    );
    for (const x of progress()) {
      expect(doc).toContain(x.identity.name);
      expect(doc).toContain(
        `| ${x.identity.name} | ${x.from}–${x.to} | ${x.placed} of ${WORLD_SIZE} |`,
      );
    }
  });
});
