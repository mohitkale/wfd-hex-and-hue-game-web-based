import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkCurve, checkEntry, stageForLevel } from "../../content/curveV2";
import { pieces } from "../../content/v2art";
import { moonlitHat } from "../../packages/game/src/collect/slice";
import { decodeArtLevel, type ArtLevelData } from "../../packages/game/src/collect/artLevelCodec";
import { OUTPUT } from "../art/levels";
import { EXTRA_LEVEL, PREVIEW_LEVEL, UNPLACED_TIER, tierFor } from "../art/placement";
import { curveEntry, placedEntries } from "./curveEntries";

/** M12.5 on the real library: the placed levels are on the curve, and the pipeline takes its tiers from it. */

describe("the art library on the curve", () => {
  const entries = placedEntries();

  it("every placed level is on the curve (a deviation fails the build)", () => {
    expect(checkCurve(entries)).toEqual([]);
    for (const e of entries) expect(checkEntry(e), e.id).toEqual([]);
  });

  it("places only pieces that exist, once each, at distinct level numbers", () => {
    const ids = Object.keys(PREVIEW_LEVEL);
    for (const id of ids) expect(pieces.map((p) => p.id)).toContain(id);
    expect(new Set(Object.values(PREVIEW_LEVEL)).size).toBe(ids.length);
    expect(entries.map((e) => e.level)).toEqual(
      [...entries.map((e) => e.level)].sort((a, b) => a - b),
    );
  });

  it("the pipeline's target tier for a piece is its stage's tier, and generated data records it", () => {
    for (const [id, level] of Object.entries(PREVIEW_LEVEL))
      expect(tierFor(id), id).toBe(stageForLevel(level).tier);
    expect(tierFor("amethyst-cluster")).toBe("tutorial"); // unplaced: the default
    expect(tierFor("black-cat")).toBe("easy"); // unplaced: its own target tier
    const data = JSON.parse(readFileSync(OUTPUT, "utf8")) as ArtLevelData[];
    for (const d of data) expect(d.generated!.tier, d.id).toBe(tierFor(d.subject.id));
    expect(data.map((d) => decodeArtLevel(d).id)).toContain("art-black-cat");
  });

  it("the hand-designed slice is on the curve at level 16 (it also passes stage 4's requirements except where it lacks depth)", () => {
    expect(EXTRA_LEVEL["slice-moonlit-hat"]).toBe(16);
    expect(checkEntry(curveEntry(moonlitHat(), 16))).toEqual([]);
    // Its measures put it in stage 3 (medium); stage 4 would also need planning depth 3.
    const asOrdering = checkEntry(curveEntry(moonlitHat(), 40));
    expect(asOrdering.join()).toContain("planningDepth 2 outside 3..5");
    expect(checkEntry(curveEntry(moonlitHat(), 60)).length).toBeGreaterThan(0);
  });

  it("the unplaced pieces really cannot be placed, and say why", () => {
    const data = JSON.parse(readFileSync(OUTPUT, "utf8")) as ArtLevelData[];
    const unplaced = data.filter((d) => PREVIEW_LEVEL[d.subject.id] === undefined);
    expect(unplaced.map((d) => d.subject.id).sort()).toEqual([
      "amethyst-cluster",
      "black-cat",
      "libra-scales",
    ]);
    for (const d of unplaced) {
      const level = decodeArtLevel(d);
      // Levels 4-5 need a loss these tutorial-grade pictures do not have (the cat has one but no dead ends).
      if (d.subject.id !== "black-cat") {
        for (const n of [4, 5])
          expect(checkEntry(curveEntry(level, n)).join(), `${d.subject.id} at ${n}`).toContain(
            "need a reachable loss",
          );
      }
      expect(checkEntry(curveEntry(level, 6)).length, `${d.subject.id} at 6`).toBeGreaterThan(0);
    }
    // The cat is easy for the cheap players but has no poor choice that costs the level.
    const cat = decodeArtLevel(data.find((d) => d.subject.id === "black-cat")!);
    expect(checkEntry(curveEntry(cat, 6)).join()).toContain("deadEndShare 0 outside 0.02..0.3");
    expect(UNPLACED_TIER["black-cat"]).toBe("easy");
  });
});
