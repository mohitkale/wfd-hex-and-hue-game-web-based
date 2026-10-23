import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkCurve, checkEntry, stageForLevel } from "../../content/curveV2";
import { pieces } from "../../content/v2art";
import { decodeArtLevel, type ArtLevelData } from "../../packages/game/src/collect/artLevelCodec";
import { OUTPUT, PREVIEW_LEVEL, tierFor } from "../art/levels";
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
    const data = JSON.parse(readFileSync(OUTPUT, "utf8")) as ArtLevelData[];
    for (const d of data) expect(d.generated!.tier, d.id).toBe(tierFor(d.subject.id));
    expect(data.map((d) => decodeArtLevel(d).id)).toContain("art-black-cat");
  });

  it("the unplaced pieces really cannot be placed: at level 4 or 5 they lack the required loss, at 6 the blocked colour or the tier", () => {
    const data = JSON.parse(readFileSync(OUTPUT, "utf8")) as ArtLevelData[];
    const unplaced = data.filter((d) => PREVIEW_LEVEL[d.subject.id] === undefined);
    expect(unplaced.map((d) => d.subject.id).sort()).toEqual(["amethyst-cluster", "libra-scales"]);
    for (const d of unplaced) {
      const level = decodeArtLevel(d);
      for (const n of [4, 5])
        expect(checkEntry(curveEntry(level, n)).join(), `${d.subject.id} at ${n}`).toContain(
          "need a reachable loss",
        );
      expect(checkEntry(curveEntry(level, 6)).length, `${d.subject.id} at 6`).toBeGreaterThan(0);
    }
  });
});
